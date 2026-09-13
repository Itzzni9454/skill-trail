/**
 * Google Calendar Smart Free-Slot Scheduling Engine
 *
 * Uses a Google Cloud Service Account with RS256 JWT auth (zero-dependency)
 * to inspect user calendar free/busy slots and automatically schedule daily
 * tasks & todos with 10-minute notifications for phone tracking.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, DATA_DIR } from './store.js';

let cachedToken = null;
let tokenExpiresAt = 0;

function base64url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function getCredentialsPath() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    const p = path.isAbsolute(process.env.GOOGLE_SERVICE_ACCOUNT_PATH)
      ? process.env.GOOGLE_SERVICE_ACCOUNT_PATH
      : path.join(ROOT, process.env.GOOGLE_SERVICE_ACCOUNT_PATH);
    if (fs.existsSync(p)) return p;
  }
  const fallback = path.join(DATA_DIR, 'google-service-account.json');
  if (fs.existsSync(fallback)) return fallback;
  const serverFallback = path.join(ROOT, 'server', 'data', 'google-service-account.json');
  if (fs.existsSync(serverFallback)) return serverFallback;
  return null;
}

export function isCalendarConfigured() {
  const credPath = getCredentialsPath();
  const calId = process.env.GOOGLE_CALENDAR_ID;
  return Boolean(credPath && calId);
}

export function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID || '';
}

/**
 * Mint an OAuth2 access token for Google Calendar using Service Account private key.
 */
export async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiresAt > now + 120) {
    return cachedToken;
  }

  const credPath = getCredentialsPath();
  if (!credPath) {
    throw new Error('Google service account credential file not found');
  }

  const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encHeader = base64url(JSON.stringify(header));
  const encClaim = base64url(JSON.stringify(claim));
  const toSign = `${encHeader}.${encClaim}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(toSign);
  const signature = signer
    .sign(creds.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwt = `${toSign}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 3600);
  return cachedToken;
}

/**
 * Query calendar freeBusy to find all free slots between 09:00 and 22:00 for the specified day.
 */
export async function getFreeSlots(calendarId = getCalendarId(), date = new Date()) {
  const token = await getAccessToken();

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // Active hours window: 09:00 to 22:00 local time
  const dayStart = new Date(year, month, day, 9, 0, 0);
  const dayEnd = new Date(year, month, day, 22, 0, 0);

  const fbRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      items: [{ id: calendarId }],
    }),
  });

  if (!fbRes.ok) {
    const errText = await fbRes.text();
    throw new Error(`Google Calendar FreeBusy failed ${fbRes.status}: ${errText}`);
  }

  const fbData = await fbRes.json();
  const busyRanges = (fbData.calendars?.[calendarId]?.busy || []).map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));

  // Sort busy ranges chronologically
  busyRanges.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Merge overlapping busy ranges
  const mergedBusy = [];
  for (const b of busyRanges) {
    if (!mergedBusy.length) {
      mergedBusy.push({ ...b });
    } else {
      const prev = mergedBusy[mergedBusy.length - 1];
      if (b.start <= prev.end) {
        prev.end = new Date(Math.max(prev.end.getTime(), b.end.getTime()));
      } else {
        mergedBusy.push({ ...b });
      }
    }
  }

  // Calculate free slots between dayStart, busy intervals, and dayEnd
  const freeSlots = [];
  let cur = new Date(Math.max(dayStart.getTime(), Date.now())); // Don't schedule in the past if today

  // Round up cur to nearest 5 minutes
  const remainderMinutes = cur.getMinutes() % 5;
  if (remainderMinutes > 0) {
    cur.setMinutes(cur.getMinutes() + (5 - remainderMinutes), 0, 0);
  }

  for (const busy of mergedBusy) {
    if (busy.start > cur) {
      const durationMs = busy.start.getTime() - cur.getTime();
      const durationMins = Math.floor(durationMs / 60000);
      if (durationMins >= 20) {
        freeSlots.push({
          start: new Date(cur),
          end: new Date(busy.start),
          durationMinutes: durationMins,
        });
      }
    }
    if (busy.end > cur) {
      cur = new Date(busy.end);
      // round to 5 mins
      const rem = cur.getMinutes() % 5;
      if (rem > 0) cur.setMinutes(cur.getMinutes() + (5 - rem), 0, 0);
    }
  }

  if (cur < dayEnd) {
    const durationMs = dayEnd.getTime() - cur.getTime();
    const durationMins = Math.floor(durationMs / 60000);
    if (durationMins >= 20) {
      freeSlots.push({
        start: new Date(cur),
        end: new Date(dayEnd),
        durationMinutes: durationMins,
      });
    }
  }

  return freeSlots;
}

/**
 * Fetch existing roadmap events from Google Calendar for the target day.
 */
export async function getExistingRoadmapEvents(calendarId = getCalendarId(), date = new Date()) {
  const token = await getAccessToken();

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const timeMin = new Date(year, month, day, 0, 0, 0).toISOString();
  const timeMax = new Date(year, month, day, 23, 59, 59).toISOString();

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('maxResults', '100');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to list calendar events: ${res.status}`);
  }

  const data = await res.json();
  return data.items || [];
}

/**
 * Schedule daily tasks into free slots in Google Calendar.
 */
export async function syncFreeSlotsSchedule(tasks = [], calendarId = getCalendarId(), date = new Date()) {
  const token = await getAccessToken();
  const existingEvents = await getExistingRoadmapEvents(calendarId, date);

  // Map existing roadmap events by taskId or title
  const existingMap = new Map();
  for (const ev of existingEvents) {
    const taskId = ev.extendedProperties?.private?.roadmapTaskId;
    if (taskId) {
      existingMap.set(taskId, ev);
    } else if (ev.summary && (ev.summary.startsWith('[Roadmap]') || ev.summary.startsWith('[DONE]'))) {
      const cleanTitle = ev.summary.replace(/^\[(?:Roadmap|DONE)\]\s*/, '').trim();
      existingMap.set(cleanTitle.toLowerCase(), ev);
    }
  }

  const freeSlots = await getFreeSlots(calendarId, date);
  const scheduled = [];
  const updated = [];

  let slotIdx = 0;
  let slotCurrentTime = freeSlots.length ? new Date(freeSlots[0].start) : null;

  for (const task of tasks) {
    const existing = existingMap.get(task.id) || existingMap.get(task.title.toLowerCase());
    const isDone = Boolean(task.isDone);

    if (existing) {
      // Update completion status if changed
      const titlePrefix = isDone ? '[DONE]' : '[Roadmap]';
      const expectedSummary = `${titlePrefix} ${task.title}`;
      const expectedColorId = isDone ? '8' : '10'; // 8 = graphite, 10 = basil/green

      if (existing.summary !== expectedSummary || existing.colorId !== expectedColorId) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${existing.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: expectedSummary,
            colorId: expectedColorId,
          }),
        });
        updated.push({ taskId: task.id, title: expectedSummary, id: existing.id });
      }
      continue;
    }

    // If task is already done and not scheduled, don't schedule new slot unless forced
    if (isDone) continue;

    // Allocate time duration: 30 mins default, 45 mins for Roadmap/Euler
    const durationMins = task.duration || (task.id === 'rm-topics' ? 45 : 30);
    const durationMs = durationMins * 60000;

    // Find next available free slot that can fit durationMins
    let allocatedStart = null;
    let allocatedEnd = null;

    while (slotIdx < freeSlots.length) {
      const slot = freeSlots[slotIdx];
      if (!slotCurrentTime || slotCurrentTime < slot.start) {
        slotCurrentTime = new Date(slot.start);
      }

      const candEnd = new Date(slotCurrentTime.getTime() + durationMs);
      if (candEnd <= slot.end) {
        allocatedStart = new Date(slotCurrentTime);
        allocatedEnd = candEnd;
        // Advance current time in this slot plus 5 min breather
        slotCurrentTime = new Date(candEnd.getTime() + 5 * 60000);
        break;
      } else {
        // Move to next slot
        slotIdx++;
        slotCurrentTime = null;
      }
    }

    if (!allocatedStart) {
      console.warn(`[gcalendar] No free slot available to fit "${task.title}" (${durationMins}m)`);
      continue;
    }

    // Insert Google Calendar event
    const eventBody = {
      summary: `[Roadmap] ${task.title}`,
      description: `${task.description || ''}\n\nTask: ${task.title}\nCategory: ${task.tag || 'Daily'}\nLink: ${task.url || 'http://localhost:5180/#/dailys'}`,
      start: { dateTime: allocatedStart.toISOString() },
      end: { dateTime: allocatedEnd.toISOString() },
      colorId: '10', // Emerald/Basil
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 10 }],
      },
      extendedProperties: {
        private: {
          roadmapTaskId: task.id,
          source: 'roadmap-offline-app',
        },
      },
    };

    const createRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    });

    if (createRes.ok) {
      const createdData = await createRes.json();
      scheduled.push({
        taskId: task.id,
        title: task.title,
        id: createdData.id,
        start: allocatedStart.toISOString(),
        end: allocatedEnd.toISOString(),
      });
    } else {
      const err = await createRes.text();
      console.error(`[gcalendar] Failed to insert event for "${task.title}":`, err);
    }
  }

  return {
    ok: true,
    calendarId,
    freeSlotsCount: freeSlots.length,
    scheduled,
    updated,
  };
}

/**
 * Quickly mark an event as done or undone in Google Calendar when completed in the app.
 */
export async function updateCalendarEventStatus(taskId, isDone, calendarId = getCalendarId()) {
  try {
    if (!isCalendarConfigured()) return false;
    const token = await getAccessToken();
    const existingEvents = await getExistingRoadmapEvents(calendarId, new Date());

    const target = existingEvents.find(
      (ev) =>
        ev.extendedProperties?.private?.roadmapTaskId === taskId ||
        ev.summary?.toLowerCase().includes(taskId.toLowerCase()),
    );

    if (!target) return false;

    const currentTitle = target.summary || '';
    const cleanTitle = currentTitle.replace(/^\[(?:Roadmap|DONE)\]\s*/, '').trim();
    const newSummary = isDone ? `[DONE] ${cleanTitle}` : `[Roadmap] ${cleanTitle}`;
    const newColorId = isDone ? '8' : '10';

    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${target.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: newSummary,
        colorId: newColorId,
      }),
    });

    return true;
  } catch (err) {
    console.warn(`[gcalendar] Could not update event status for ${taskId}:`, err.message);
    return false;
  }
}

/**
 * Health check & status for UI.
 */
export async function getCalendarStatus() {
  const configured = isCalendarConfigured();
  if (!configured) {
    return {
      configured: false,
      calendarId: null,
      error: 'Google Service Account or Calendar ID missing in .env',
    };
  }

  try {
    const token = await getAccessToken();
    const calId = getCalendarId();
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return {
        configured: true,
        calendarId: calId,
        connected: false,
        error: `HTTP ${res.status} — verify calendar is shared with the service account`,
      };
    }

    const freeSlots = await getFreeSlots(calId, new Date());
    const existing = await getExistingRoadmapEvents(calId, new Date());

    return {
      configured: true,
      calendarId: calId,
      connected: true,
      freeSlotsCount: freeSlots.length,
      existingEventsCount: existing.length,
      freeSlots,
    };
  } catch (err) {
    return {
      configured: true,
      calendarId: getCalendarId(),
      connected: false,
      error: err.message,
    };
  }
}
