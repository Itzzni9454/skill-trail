' Opens Roadmap & Habitica in the user's Default System Browser
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
RootDir = fso.GetParentFolderName(ScriptDir)
ServerDir = RootDir & "\server"

' Ensure background server is started
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.open "GET", "http://localhost:4177/api/health", False
http.setTimeouts 1000, 1000, 1000, 1000
http.send

If Err.Number <> 0 Or http.status <> 200 Then
    NodeCmd = "cmd.exe /c node src/server.js"
    If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
        NodeCmd = """C:\Program Files\nodejs\node.exe"" src/server.js"
    End If
    WshShell.CurrentDirectory = ServerDir
    WshShell.Run NodeCmd, 0, False
    WScript.Sleep 1500
End If
On Error Goto 0

AppUrl = "http://localhost:4177/#/dashboard"

' Open URL in the Windows default web browser (Chrome, Brave, Firefox, Edge, etc.)
WshShell.Run "rundll32 url.dll,FileProtocolHandler " & AppUrl, 1, False
