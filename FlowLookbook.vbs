' Flow Lookbook - bo khoi dong: mo app desktop (cua so rieng), khong qua trinh duyet.
' Bam dup file nay (hoac shortcut "Flow Lookbook" ngoai Desktop) la dung duoc ngay.
Option Explicit

Dim fso, shell, baseDir, exe
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = fso.BuildPath(baseDir, "node_modules\electron\dist\electron.exe")

' Lan dau thieu thu vien/Electron: dung start.bat de cai (co hien tien trinh cho biet).
If Not fso.FileExists(exe) Then
  shell.CurrentDirectory = baseDir
  shell.Run """" & fso.BuildPath(baseDir, "start.bat") & """", 1, True
  WScript.Quit 0
End If

' Mo app o che do an cua so lenh; cua so app tu hien ra.
' Neu app dang mo, Electron se tu dua cua so cu len truoc (khong mo trung).
shell.CurrentDirectory = baseDir
shell.Run """" & exe & """ """ & baseDir & """", 0, False
