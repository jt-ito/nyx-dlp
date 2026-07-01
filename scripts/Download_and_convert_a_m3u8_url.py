try:
    import ensure_ffmpeg
    ensure_ffmpeg.run()
except Exception:
    pass

import os
import sys
import subprocess
import atexit
import signal

_download_active = True

def _write_stopped(u: str) -> None:
    try:
        if os.path.exists('stopped_downloads.txt'):
            with open('stopped_downloads.txt', 'r', encoding='utf-8') as f:
                if u in [line.strip() for line in f]:
                    return
        with open('stopped_downloads.txt', 'a', encoding='utf-8') as f:
            f.write(u + '\n')
    except Exception:
        pass

def _on_exit() -> None:
    if _download_active and 'url' in globals():
        _write_stopped(url)

atexit.register(_on_exit)
signal.signal(signal.SIGTERM, lambda *_: sys.exit(1))

NVENC_CODECS = {'h264_nvenc', 'h265_nvenc', 'hevc_nvenc'}

def download_and_convert_m3u8(url, choice_lower, codec='h264_nvenc', bitrate='6M',
                               resolution='1920x1080', fps='60', audio_bitrate='192k',
                               container='mp4'):
    ext_map = {'mp4': '.mp4', 'mkv': '.mkv', 'mov': '.mov', 'ts': '.ts', 'avi': '.avi'}
    extension = ext_map.get(container, '.mp4')
    # -bsf:a aac_adtstoasc is required for MP4/MOV containers; others handle raw AAC natively
    needs_bsf = container in ('mp4', 'mov')
    base_name = "output"
    counter = 0

    # Find a unique filename for the final output
    output_file = f"{base_name}{counter}{extension}"
    while os.path.exists(output_file):
        counter += 1
        output_file = f"{base_name}{counter}{extension}"

    use_cuda = codec in NVENC_CODECS

    if choice_lower != "n":
        # Single-pass: encode directly from the URL
        encode_command = ["ffmpeg", "-y"]
        if use_cuda:
            encode_command += ["-hwaccel", "cuda"]
        encode_command += [
            "-i", url,
            "-map", "0:a:0",
            "-map", "0:v:0",
            "-map_metadata", "0",
            "-c:v", codec,
            "-b:v", bitrate,
            "-c:a", "aac",
            "-b:a", audio_bitrate,
            "-ar", "48000",
            "-ac", "2",
        ]
        if fps != "source":
            encode_command += ["-r", fps]
        if resolution != "source":
            encode_command += ["-s", resolution]
        encode_command += [
            "-color_primaries", "bt709",
            "-color_trc", "bt709",
            "-colorspace", "bt709",
        ]
        if needs_bsf:
            encode_command += ["-bsf:a", "aac_adtstoasc"]
        encode_command += [output_file]
        subprocess.run(encode_command, check=True)
    else:
        # Download and copy the stream without re-encoding
        copy_command = ["ffmpeg", "-y"]
        if use_cuda:
            copy_command += ["-hwaccel", "cuda", "-c:v", "h264_cuvid"]
        copy_command += [
            "-i", url,
            "-c", "copy",
            "-map_metadata", "0",
        ]
        if needs_bsf:
            copy_command += ["-bsf:a", "aac_adtstoasc"]
        copy_command += [output_file]
        subprocess.run(copy_command, check=True)
        print("No encoding performed.")

    return output_file

if __name__ == "__main__":
    url         = sys.argv[1] if len(sys.argv) > 1 else input("Enter the video m3u8 URL and press enter: ")
    choice      = sys.argv[2] if len(sys.argv) > 2 else input("Do you want to encode the video? (Y/n): ")
    codec       = sys.argv[3] if len(sys.argv) > 3 else 'h264_nvenc'
    bitrate     = sys.argv[4] if len(sys.argv) > 4 else '6M'
    resolution  = sys.argv[5] if len(sys.argv) > 5 else '1920x1080'
    fps         = sys.argv[6] if len(sys.argv) > 6 else '60'
    audio_bitrate = sys.argv[7] if len(sys.argv) > 7 else '192k'
    container   = sys.argv[8] if len(sys.argv) > 8 else 'mp4'
    # sys.argv[9] = cookies_path (accepted for API consistency, not used by ffmpeg)
    choice_lower = choice.lower()
    try:
        encoded_video = download_and_convert_m3u8(url, choice_lower, codec, bitrate, resolution, fps, audio_bitrate, container)
    except subprocess.CalledProcessError:
        try:
            with open('failed_downloads.txt', 'a', encoding='utf-8') as f:
                f.write(url + '\n')
        except Exception:
            pass
    finally:
        _download_active = False
