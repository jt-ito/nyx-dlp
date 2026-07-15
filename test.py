import os
import sys

# Mock args to test _apply_extra_args logic
sys.argv = ['yt-dlp.py', 'https://www.youtube.com/watch?v=NmqZbDwfdpU', 'bestvideo+bestaudio/best', '', '["--extractor-args","youtube:player_client=tv"]', 'mp4', '', '', 'http://127.0.0.1:4416', 'y']

import json
sys.path.insert(0, 'scripts')
import ensure_ffmpeg
import yt_dlp

def main():
    url = sys.argv[1]
    fmt = sys.argv[2]
    cookies_path = sys.argv[3]
    extra_args = json.loads(sys.argv[4])
    bgutil_url = sys.argv[8]

    _extractor_args = {}
    if bgutil_url and bgutil_url != 'local':
        _extractor_args = {
            'youtubepot-bgutilhttp': {'base_url': [bgutil_url]},
        }
    
    ydl_opts = {'format': fmt}
    if _extractor_args:
        ydl_opts['extractor_args'] = _extractor_args

    # Copied _apply_extra_args logic
    def _apply_extra_args(opts: dict, extra: list) -> dict:
        i = 0
        while i < len(extra):
            f = extra[i]
            nv = extra[i + 1] if i + 1 < len(extra) else None
            if f == '--extractor-args':
                if nv and ':' in nv:
                    ie_key, args_str = nv.split(':', 1)
                    ext_args = opts.setdefault('extractor_args', {})
                    ie_dict = ext_args.setdefault(ie_key, {})
                    for a in args_str.split(';'):
                        if '=' in a:
                            k, v = a.split('=', 1)
                        else:
                            k, v = a, 'true'
                        ie_dict[k] = [v]
                i += 1
            i += 1
        return opts

    _apply_extra_args(ydl_opts, extra_args)
    print(ydl_opts)

main()
