@echo off
echo Starting download of Part 2 (the final hour of the VOD)...
C:\Users\ito\AppData\Roaming\nyx-dlp\vendor\ytdlp\yt-dlp.exe --enable-file-urls "file:///C:/Users/ito/Desktop/Script_UI/slice.m3u8" -o "C:\Users\ito\Desktop\Script_UI\part2.mp4"
echo.
echo Download complete! You can now use the Video Concatenator tab to merge your original video with part2.mp4.
pause
