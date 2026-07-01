try:
    import ensure_ffmpeg
    ensure_ffmpeg.run()
except Exception:
    pass

import sys
import json
import shutil
import datetime
import re
from pathlib import Path
import subprocess
import time

def run_ffmpeg_progress(cmd: list, total_sec: float, desc: str):
    print(f"> {desc} (Total duration: {total_sec:.2f}s)")
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1,
                            encoding="utf-8", errors="replace")
    
    last_print = time.time()
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            if k == "out_time_ms":
                try:
                    current_sec = int(v) / 1_000_000
                    now = time.time()
                    if now - last_print > 2.0: # Print update every 2 seconds
                        pct = (current_sec / total_sec) * 100
                        if pct > 100: pct = 100
                        print(f"[splitting] {pct:.1f}% ({current_sec:.2f}s / {total_sec:.2f}s) - {desc}")
                        last_print = now
                except ValueError:
                    pass
        elif line.startswith("error") or "Failed" in line or "Error" in line:
            print(f"warning: ffmpeg: {line}")
            
    proc.wait()
    if proc.returncode != 0:
        print(f"error: ffmpeg exited with code {proc.returncode}", file=sys.stderr)
        raise subprocess.CalledProcessError(proc.returncode, cmd)

import argparse

def find_or_exit(cmd: str) -> str:
    p = shutil.which(cmd)
    if not p:
        print(f"error: '{cmd}' not found on PATH.", file=sys.stderr)
        sys.exit(1)
    return p

def probe(ffprobe: str, path: Path) -> dict:
    try:
        raw = subprocess.check_output([
            ffprobe, "-v", "error",
            "-print_format", "json",
            "-show_format", "-show_streams", str(path)
        ], stderr=subprocess.STDOUT)
        return json.loads(raw)
    except subprocess.CalledProcessError as e:
        print(f"error: ffprobe failed on {path.name}: {e.output.decode().strip() if hasattr(e, 'output') and e.output else str(e)}", file=sys.stderr)
        sys.exit(1)

if sys.stdout and getattr(sys.stdout, 'encoding', '').lower() != 'utf-8':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except: pass
if sys.stderr and getattr(sys.stderr, 'encoding', '').lower() != 'utf-8':
    try: sys.stderr.reconfigure(encoding='utf-8')
    except: pass
def split_video(input_file, num_parts, custom_output_dir=None, force_ext=None):
    safe_path = Path(input_file).resolve()
    
    if not safe_path.is_file():
        print(f"error: File not found: {safe_path}", file=sys.stderr)
        sys.exit(1)
        
    ffmpeg_cmd = find_or_exit("ffmpeg")
    ffprobe_cmd = find_or_exit("ffprobe")

    try:
        print(f"Probing {safe_path.name}...")
        probe_data = probe(ffprobe_cmd, safe_path)
    except Exception as e:
        print("error: FFmpeg failed to probe file", file=sys.stderr)
        print(str(e), file=sys.stderr)
        sys.exit(1)
        
    video_info = next((stream for stream in probe_data.get('streams', []) if stream.get('codec_type') == 'video'), None)
    if not video_info:
        print("error: No video stream found.", file=sys.stderr)
        sys.exit(1)
        
    duration = float(video_info['duration'])
    part_duration = duration / num_parts
    print(f"Total duration: {duration:.2f}s. Splitting into {num_parts} parts (~{part_duration:.2f}s each).")
    
    ranges = []
    for i in range(num_parts):
        start_seconds = i * part_duration
        end_seconds = (i + 1) * part_duration if i < num_parts - 1 else duration
        
        start_time = datetime.timedelta(seconds=start_seconds)
        end_time = datetime.timedelta(seconds=end_seconds)
        
        start_str = f'{int(start_time.total_seconds()//3600):02}:{int((start_time.total_seconds()//60)%60):02}:{int(start_time.total_seconds()%60):02}'
        end_str = f'{int(end_time.total_seconds()//3600):02}:{int((end_time.total_seconds()//60)%60):02}:{int(end_time.total_seconds()%60):02}'
        
        ranges.append((start_str, end_str, start_seconds, end_seconds - start_seconds))
        
    if custom_output_dir:
        output_dir = Path(custom_output_dir).resolve()
    else:
        output_dir = safe_path.parent
        
    metadata_title = probe_data.get('format', {}).get('tags', {}).get('title')
    if metadata_title:
        clean_title = re.sub(r'[\\/:*?"<>|]', '', metadata_title).strip(' .')
        base_name = clean_title if clean_title else safe_path.stem
    else:
        base_name = safe_path.stem
        
    if force_ext:
        ext = f".{force_ext.lstrip('.')}"
    else:
        ext = safe_path.suffix
    
    txt_path = output_dir / f"{base_name}_durations.txt"
    try:
        with open(txt_path, 'w', encoding='utf-8') as f:
            lines = [f'{start_str} - {end_str} Part {i+1}' for i, (start_str, end_str, _, _) in enumerate(ranges)]
            for line in lines: print(line)
            f.write('\n'.join(lines))
    except Exception as e:
        print(f"warning: Could not write durations file: {e}")
            
    for i, (_, _, start_sec, dur_sec) in enumerate(ranges):
        out_name = output_dir / f"{base_name} pt{i+1}{ext}"
        print(f"Processing pt{i+1}/{num_parts} -> {out_name.name} ...")
        try:
            cmd = [
                ffmpeg_cmd, '-y', '-nostats', '-progress', 'pipe:1',
                '-ss', str(start_sec),
                '-i', str(safe_path)
            ]
            if i < num_parts - 1:
                cmd.extend(['-t', str(dur_sec)])
            
            if ext.lower() in ['.mp4', '.mov', '.m4v']:
                cmd.extend(['-movflags', '+faststart'])
                
            cmd.extend(['-c', 'copy', str(out_name)])

            try:
                run_ffmpeg_progress(cmd, dur_sec, f"Part {i+1}")
            except subprocess.CalledProcessError:
                sys.exit(1)
            print(f"Finished Part {i+1}.")
        except Exception as e:
            print(f"error: FFmpeg error processing part {i+1}: {e}", file=sys.stderr)
            sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Video Splitter")
    parser.add_argument("input_file", help="Path to input video file")
    parser.add_argument("num_parts", type=int, help="Number of parts to split into")
    parser.add_argument("output_dir", nargs="?", default=None, help="Output directory")
    parser.add_argument("--format", dest="format", default=None, help="Output container format")
    
    args = parser.parse_args()
    
    if args.num_parts < 2:
        print("error: number of parts must be at least 2.", file=sys.stderr)
        sys.exit(1)
        
    split_video(args.input_file, args.num_parts, args.output_dir, args.format)
