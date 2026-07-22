import yt_dlp
import sys

def my_hook(d):
    if d['status'] == 'downloading':
        # print keys of d
        info = d.get('info_dict', {})
        vid = info.get('vcodec')
        aud = info.get('acodec')
        fmt = info.get('format_id')
        print(f"Hook: vcodec={vid}, acodec={aud}, fmt={fmt}")
        sys.exit(0)

ydl_opts = {
    'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
    'progress_hooks': [my_hook],
    'quiet': True,
    'concurrent_fragment_downloads': 2
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.download(['https://www.youtube.com/watch?v=jNQXAC9IVRw'])