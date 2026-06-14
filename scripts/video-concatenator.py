import sys, json, shutil, tempfile, subprocess, argparse
from pathlib import Path
import logging
import time

if sys.stdout and getattr(sys.stdout, 'encoding', '').lower() != 'utf-8':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except: pass
if sys.stderr and getattr(sys.stderr, 'encoding', '').lower() != 'utf-8':
    try: sys.stderr.reconfigure(encoding='utf-8')
    except: pass

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

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

def has_nvenc(ffmpeg: str) -> bool:
    try:
        out = subprocess.check_output([ffmpeg, "-encoders"], stderr=subprocess.DEVNULL)
        return b"h264_nvenc" in out
    except:
        return False

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
                        print(f"[progress] {desc}: {pct:.1f}% ({current_sec:.2f}s / {total_sec:.2f}s)")
                        last_print = now
                except ValueError:
                    pass
        elif line.startswith("error") or "Failed" in line or "Error" in line:
            print(f"warning: ffmpeg: {line}")
            
    proc.wait()
    if proc.returncode != 0:
        print(f"error: ffmpeg exited with code {proc.returncode}", file=sys.stderr)
        raise subprocess.CalledProcessError(proc.returncode, cmd)

def reencode_to_match(ffmpeg: str, src: Path,
                      ref_meta: dict, src_meta: dict,
                      use_nvenc: bool):
    duration = float(src_meta["format"]["duration"])
    rv = next(s for s in ref_meta["streams"] if s["codec_type"] == "video")
    fps = rv["avg_frame_rate"]
    w, h = rv["width"], rv["height"]

    tmp = Path(tempfile.NamedTemporaryFile(
        prefix="fix_", suffix=src.suffix, delete=False).name)

    if use_nvenc:
        vcodec = ["-c:v", "h264_nvenc", "-preset", "slow",
                  "-rc:v", "vbr_hq", "-cq:v", "19", "-gpu", "0"]
        print(f"info: Using NVENC to re-encode {src.name}")
    else:
        vcodec = ["-c:v", "libx264", "-preset", "slow", "-crf", "18"]
        print(f"info: NVENC unavailable, using libx264 to re-encode {src.name}")

    cmd = [
        ffmpeg, "-y", "-i", str(src),
        "-vf", f"fps={fps},scale={w}:{h}",
        *vcodec, "-c:a", "copy",
        "-progress", "pipe:1", "-nostats",
        str(tmp)
    ]
    run_ffmpeg_progress(cmd, duration, f"Re-encoding {src.name}")
    return tmp, duration

def remux_to_ts(ffmpeg: str, src: Path, duration: float, label: str):
    ts = Path(tempfile.NamedTemporaryFile(
        prefix="ts_", suffix=".ts", delete=False).name)
    cmd = [
        ffmpeg, "-y", "-i", str(src),
        "-c", "copy",
        "-bsf:v", "h264_mp4toannexb",
        "-f", "mpegts", str(ts),
        "-progress", "pipe:1", "-nostats"
    ]
    run_ffmpeg_progress(cmd, duration, f"Remux → TS {label}")
    return ts

def format_hms(seconds: float) -> str:
    s = int(seconds + 0.5)
    h = s // 3600; m = (s % 3600) // 60; s2 = s % 60
    return f"{h:02d}:{m:02d}:{s2:02d}"

def save_timestamps(durations, output_txt):
    try:
        with open(output_txt, "w", encoding='utf-8') as f:
            start_time = 0
            for idx, duration in enumerate(durations):
                end_time = start_time + duration
                f.write(f"{format_hms(start_time)} - {format_hms(end_time)} Part {idx + 1}\n")
                start_time = end_time
    except Exception as e:
        print(f"warning: Could not write timestamps file: {e}")

def main():
    parser = argparse.ArgumentParser(description="Video Concatenator")
    parser.add_argument("--output", required=True, help="Output MP4 file path")
    parser.add_argument("--force-encode", action="store_true", help="Force re-encode all videos")
    parser.add_argument("videos", nargs="+", help="Paths to video files to concatenate")
    args = parser.parse_args()

    vids = []
    for raw in args.videos:
        p = Path(raw).resolve()
        if not p.exists() or not p.is_file():
            print(f"error: File not found: {p}", file=sys.stderr)
            sys.exit(1)
        vids.append(p)

    if len(vids) < 2:
        print("error: Need at least two videos to concatenate.", file=sys.stderr)
        sys.exit(1)

    output = Path(args.output).resolve()
    if not output.suffix:
        output = output.with_suffix(".mp4")

    # Sanitize the output filename but keep the directory path
    clean_name = sanitize_filename(output.name)
    output = output.with_name(clean_name)
    print(f"Output target: {output}")

    ffmpeg = find_or_exit("ffmpeg")
    ffprobe = find_or_exit("ffprobe")
    use_nvenc = has_nvenc(ffmpeg)

    metas, durations = [], []
    for v in vids:
        print(f"Probing {v.name}...")
        m = probe(ffprobe, v)
        metas.append(m)
        durations.append(float(m["format"]["duration"]))
        
    total_sec = sum(durations)
    print(f"Total expected duration: {format_hms(total_sec)}")

    ref_meta = metas[0]
    reencoded_mp4, ts_parts = [], []

    for idx, vid in enumerate(vids):
        dur = durations[idx]
        if idx == 0:
            src = vid
        else:
            rv = next(s for s in ref_meta["streams"] if s["codec_type"] == "video")
            tv = next(s for s in metas[idx]["streams"] if s["codec_type"] == "video")
            mismatch = (
                rv["avg_frame_rate"] != tv["avg_frame_rate"] or
                (rv["width"], rv["height"]) != (tv["width"], tv["height"])
            )
            if args.force_encode or mismatch:
                src, _ = reencode_to_match(ffmpeg, vid, ref_meta, metas[idx], use_nvenc)
                reencoded_mp4.append(src)
            else:
                src = vid
        ts = remux_to_ts(ffmpeg, src, dur, vid.name)
        ts_parts.append(ts)

    # write a temporary list file for concat demuxer
    list_file = Path(tempfile.gettempdir()) / "concat_list.txt"
    try:
        with open(list_file, "w", encoding='utf-8') as f:
            for ts in ts_parts:
                f.write(f"file '{ts.resolve()}'\n")
    except Exception as e:
        print(f"error: Failed to write concat list: {e}", file=sys.stderr)
        sys.exit(1)

    # build final command using concat demuxer with regenerated PTS
    final_cmd = [
        ffmpeg, "-y",
        "-fflags", "+genpts",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c", "copy",
        "-bsf:a", "aac_adtstoasc",
    ]
    
    if output.suffix.lower() in [".mp4", ".mov", ".m4v"]:
        final_cmd.extend(["-movflags", "+faststart"])
        
    final_cmd.extend([
        "-progress", "pipe:1", "-nostats",
        str(output)
    ])
    
    print(f"\n--- Muxing final {output.suffix.upper()[1:]} ---")
    try:
        run_ffmpeg_progress(final_cmd, total_sec, "Finalizing")
    except subprocess.CalledProcessError:
        print("error: Final muxing failed.", file=sys.stderr)
        sys.exit(1)
        
    try:
        list_file.unlink()
    except Exception:
        pass

    timestamp_file = output.with_suffix(".txt")
    save_timestamps(durations, timestamp_file)
    print(f"Timestamps saved to {timestamp_file.name}")

    for f in reencoded_mp4 + ts_parts:
        try:
            f.unlink()
        except:
            print(f"warning: Could not delete temp file: {f}")

    print(f"\nDone! Output saved to: {output}")

if __name__ == "__main__":
    main()
