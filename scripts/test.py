import os
import shutil
import ensure_ffmpeg

ensure_ffmpeg.run()
ffmpeg_path = shutil.which('ffmpeg')
ffprobe_path = shutil.which('ffprobe')

print(f'ffmpeg in path: {ffmpeg_path}')
print(f'ffprobe in path: {ffprobe_path}')
