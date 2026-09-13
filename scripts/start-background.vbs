' Silent background launcher for Roadmap & Habitica Server
' Starts the Node.js server with windowStyle = 0 (completely hidden)

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
RootDir = fso.GetParentFolderName(ScriptDir)
ServerDir = RootDir & "\server"

' Check if server is already running and healthy
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.open "GET", "http://localhost:4177/api/health", False
http.setTimeouts 1000, 1000, 1000, 1000
http.send

If Err.Number = 0 And http.status = 200 Then
    ' Already running
    WScript.Quit 0
End If
On Error Goto 0

NodeCmd = "cmd.exe /c node src/server.js"
If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
    NodeCmd = """C:\Program Files\nodejs\node.exe"" src/server.js"
End If

WshShell.CurrentDirectory = ServerDir
WshShell.Run NodeCmd, 0, False
