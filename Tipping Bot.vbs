Option Explicit

Dim shell, fso, scriptDir, command, exec, portablePath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
portablePath = scriptDir & "\dist\tipping-bot-workspace\Tipping Bot Portable.exe"

If WScript.Arguments.Count > 0 Then
  If LCase(WScript.Arguments.Item(0)) = "--smoke-test" Then
    ' If portable exists, smoke test that instead
    If fso.FileExists(portablePath) Then
      Set exec = shell.Exec(QuoteArg(portablePath) & " --smoke-test")
      Do While exec.Status = 0
        WScript.Sleep 100
      Loop
      WScript.Quit exec.ExitCode
    End If

    ' Fallback to npm smoke test
    Set exec = shell.Exec("cmd.exe /c cd /d " & QuoteArg(scriptDir) & " && npm run discord:gui:smoke")

    Do While exec.Status = 0
      WScript.Sleep 100
    Loop

    If Not exec.StdOut.AtEndOfStream Then
      WScript.Echo exec.StdOut.ReadAll
    End If

    If Not exec.StdErr.AtEndOfStream Then
      WScript.Echo exec.StdErr.ReadAll
    End If

    WScript.Quit exec.ExitCode
  End If
End If

' One-click tester logic
If fso.FileExists(portablePath) Then
    ' 1. Run portable build if available
    command = QuoteArg(portablePath)
    shell.Run command, 1, False
Else
    ' 2. Development Fallback: Auto-install dependencies if missing
    If Not fso.FolderExists(scriptDir & "\node_modules") Then
        shell.Popup "First time setup: Installing dependencies. This may take a minute...", 5, "SportsTips Setup", 64
        shell.Run "cmd.exe /c cd /d " & QuoteArg(scriptDir) & " && npm install", 1, True
    End If
    
    command = "cmd.exe /c cd /d " & QuoteArg(scriptDir) & " && npm start"
    shell.Run command, 0, False
End If

Function QuoteArg(value)
  QuoteArg = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function