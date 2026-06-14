import sys
import ffmpeg
import datetime
import re
from pathlib import Path

import argparse

def split_video(input_file, num_parts, custom_output_dir=None, force_ext=None):
    safe_path = Path(input_file).resolve()
    
    if not safe_path.is_file():
        print(f"error: File not found: {safe_path}", file=sys.stderr)
        sys.exit(1)
        
    try:
        print(f"Probing {safe_path.name}...")
        probe = ffmpeg.probe(str(safe_path))
    except ffmpeg.Error as e:
        print("error: FFmpeg failed to probe file", file=sys.stderr)
        if e.stderr:
            print(e.stderr.decode('utf8'), file=sys.stderr)
        sys.exit(1)
        
    video_info = next((stream for stream in probe['streams'] if stream['codec_type'] == 'video'), None)
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
        
    metadata_title = probe.get('format', {}).get('tags', {}).get('title')
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
            for i, (start_str, end_str, _, _) in enumerate(ranges):
                line = f'{start_str} - {end_str} pt{i+1}'
                print(line)
                f.write(line + '\n')
    except Exception as e:
        print(f"warning: Could not write durations file: {e}")
            
    for i, (_, _, start_sec, dur_sec) in enumerate(ranges):
        out_name = output_dir / f"{base_name} pt{i+1}{ext}"
        print(f"Processing pt{i+1}/{num_parts} -> {out_name.name} ...")
        try:
            output_kwargs = {'c': 'copy'}
            if ext.lower() in ['.mp4', '.mov', '.m4v']:
                output_kwargs['movflags'] = '+faststart'
                
            if i < num_parts - 1:
                (
                    ffmpeg
                    .input(str(safe_path), ss=start_sec)
                    .output(str(out_name), t=dur_sec, **output_kwargs)
                    .global_args('-loglevel', 'warning')
                    .run(overwrite_output=True, capture_stdout=True, capture_stderr=True)
                )
            else:
                (
                    ffmpeg
                    .input(str(safe_path), ss=start_sec)
                    .output(str(out_name), **output_kwargs)
                    .global_args('-loglevel', 'warning')
                    .run(overwrite_output=True, capture_stdout=True, capture_stderr=True)
                )
            print(f"Finished Part {i+1}.")
        except ffmpeg.Error as e:
            print(f"error: FFmpeg error processing part {i+1}:", file=sys.stderr)
            if e.stderr:
                print(e.stderr.decode('utf8'), file=sys.stderr)
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
