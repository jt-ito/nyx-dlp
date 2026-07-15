import os
import sys
import json
import shutil
import subprocess

def check_resolution(filepath: str, expected_height: int = None) -> None:
    if not filepath or not os.path.isfile(filepath):
        return
        
    ffprobe = shutil.which('ffprobe')
    if not ffprobe:
        print("[Resolution Check] Skipped: 'ffprobe' is not installed or not in PATH.", flush=True)
        return
        
    try:
        raw = subprocess.check_output([
            ffprobe, "-v", "error", "-select_streams", "v",
            "-show_entries", "stream=height", "-of", "json", filepath
        ], stderr=subprocess.STDOUT)
        data = json.loads(raw)
        streams = data.get('streams', [])
        if not streams:
            return
            
        # Get the maximum height across all video streams to ignore embedded thumbnails (which are usually 360p)
        actual_height = max([s.get('height') or 0 for s in streams])
        
        if actual_height:
            if expected_height:
                print(f"[Resolution Check] Expected: {expected_height}p, Actual: {actual_height}p", flush=True)
            else:
                print(f"[Resolution Check] Actual: {actual_height}p", flush=True)
            
        if expected_height and actual_height and actual_height < expected_height:
            msg = f"\nERROR: Final file resolution ({actual_height}p) is lower than expected ({expected_height}p)!\n" \
                  "This typically occurs if ffmpeg is missing and failed to merge the best audio/video streams, or if the server provided a lower quality stream."
            print(msg, flush=True)
            
            # Write to a log file in the base directory
            log_path = os.path.join(os.path.dirname(filepath), "resolution_errors.log")
            try:
                with open(log_path, "a", encoding="utf-8") as f:
                    f.write(f"File: {os.path.basename(filepath)}\n{msg}\n\n")
            except Exception:
                pass
    except Exception as e:
        # Silently pass ffprobe failures to avoid spamming the user if it's not a valid video
        pass
