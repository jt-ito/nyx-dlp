try:
    import ensure_ffmpeg
    ensure_ffmpeg.run()
except Exception:
    pass

import sys, json, shutil, subprocess, argparse, time, threading
from pathlib import Path
import concurrent.futures
import logging

if sys.stdout and getattr(sys.stdout, 'encoding', '').lower() != 'utf-8':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except: pass
if sys.stderr and getattr(sys.stderr, 'encoding', '').lower() != 'utf-8':
    try: sys.stderr.reconfigure(encoding='utf-8')
    except: pass

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

INVALID = '<>:"/\\|?*\n\r\t'

def sanitize_filename(name: str) -> str:
    cleaned = ''.join(ch if ch not in INVALID else '_' for ch in name)
    return cleaned.rstrip(' .') or "output"

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
        print(f"error: ffprobe failed on {path.name}: {e.output.decode().strip()}", file=sys.stderr)
        sys.exit(1)

progress_lock = threading.Lock()
video_progress = {}
total_sec_all = 0.0
global_last_print = 0.0

def run_ffmpeg_worker(cmd: list, duration: float, vid_path: Path, desc: str):
    global global_last_print
    print(f"> {desc} (Duration: {duration:.2f}s)")
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1,
                            encoding="utf-8", errors="replace")
    
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            if k == "out_time_ms":
                try:
                    csec = int(v) / 1_000_000
                    now = time.time()
                    with progress_lock:
                        video_progress[str(vid_path)] = min(csec, duration)
                        if now - global_last_print > 1.0:
                            total_csec = sum(video_progress.values())
                            pct = (total_csec / total_sec_all) * 100 if total_sec_all > 0 else 0
                            print(f"[download] {pct:.1f}% ({total_csec:.2f}s / {total_sec_all:.2f}s) - Processing...")
                            global_last_print = now
                except ValueError:
                    pass
        elif line.startswith("error") or "Failed" in line or "Error" in line:
            print(f"warning: ffmpeg ({vid_path.name}): {line}")
            
    proc.wait()
    with progress_lock:
        video_progress[str(vid_path)] = duration
    if proc.returncode != 0:
        print(f"error: ffmpeg exited with code {proc.returncode} for {vid_path.name}", file=sys.stderr)
        raise subprocess.CalledProcessError(proc.returncode, cmd)

def process_video(vid: Path, output_dir: Path, vcodec: str, acodec: str, ffmpeg: str):
    if output_dir == vid.parent:
        output_name = vid.stem + "_encoded" + vid.suffix
    else:
        output_name = vid.name
    
    output_path = output_dir / sanitize_filename(output_name)
    
    # Change extension if extracting audio only
    if vcodec == "none" and acodec != "none":
        ext_map = {"aac": ".m4a", "mp3": ".mp3", "opus": ".opus", "copy": ".m4a"}
        output_path = output_path.with_suffix(ext_map.get(acodec, ".m4a"))
    elif vcodec != "none" and output_path.suffix == "":
        output_path = output_path.with_suffix(".mp4")
        
    cmd = [ffmpeg, "-y", "-i", str(vid)]
    
    if vcodec == "none":
        cmd.extend(["-vn"])
    else:
        cmd.extend(["-c:v", vcodec])
        
    if acodec == "none":
        cmd.extend(["-an"])
    else:
        cmd.extend(["-c:a", acodec])
        
    cmd.extend(["-progress", "pipe:1", "-nostats", str(output_path)])
    
    run_ffmpeg_worker(cmd, video_progress[str(vid)], vid, f"Encoding {vid.name}")

def main():
    global total_sec_all
    parser = argparse.ArgumentParser(description="Video Encoder")
    parser.add_argument("--mode", choices=["sequential", "parallel"], default="sequential")
    parser.add_argument("--vcodec", default="copy")
    parser.add_argument("--acodec", default="copy")
    parser.add_argument("videos", nargs="+")
    args = parser.parse_args()

    vids = []
    for raw in args.videos:
        p = Path(raw).resolve()
        if p.exists() and p.is_file():
            vids.append(p)
            
    if not vids:
        print("error: No valid video files provided.", file=sys.stderr)
        sys.exit(1)

    # Use first video's directory if not specified otherwise in args
    # But wait, renderer.js passes outputDir as the cwd.
    output_dir = Path.cwd()

    ffmpeg = ensure_ffmpeg.get_ffmpeg_path()
    ffprobe = ensure_ffmpeg.get_ffprobe_path()

    print("Probing files...")
    for v in vids:
        m = probe(ffprobe, v)
        dur = float(m.get("format", {}).get("duration", 0))
        video_progress[str(v)] = dur
        total_sec_all += dur
        
    # Reset tracking dict for actual progress
    for k in video_progress.keys():
        video_progress[k] = 0.0

    print(f"Total processing duration: {total_sec_all:.2f}s")
    
    start_time = time.time()
    
    if args.mode == "parallel":
        max_workers = min(4, len(vids))
        print(f"Starting parallel encoding with {max_workers} workers...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = []
            for vid in vids:
                futures.append(executor.submit(process_video, vid, output_dir, args.vcodec, args.acodec, ffmpeg))
            for f in concurrent.futures.as_completed(futures):
                try:
                    f.result()
                except Exception as e:
                    print(f"error: Job failed: {e}", file=sys.stderr)
    else:
        print("Starting sequential encoding...")
        for vid in vids:
            try:
                process_video(vid, output_dir, args.vcodec, args.acodec, ffmpeg)
            except Exception as e:
                print(f"error: Job failed: {e}", file=sys.stderr)
                
    elapsed = time.time() - start_time
    print(f"\n[download] 100.0% ({total_sec_all:.2f}s / {total_sec_all:.2f}s) - Done")
    print(f"Done! Finished in {elapsed:.2f}s")

if __name__ == "__main__":
    main()
