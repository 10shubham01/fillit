# Launch video pipeline

`slashslash-launch.mp4` (and the README GIF) are rendered entirely from code —
no screen recording. `launch.html` is a deterministic animation: every frame is
a pure function of time, exposed as `window.seek(t)`.

## Watch / scrub locally

Open `launch.html?play=1` in any browser to play it live, or `launch.html?t=12`
to freeze any moment (great for tweaking a scene).

## Re-render the video

Requires: Chrome, Node ≥ 22, and `ffmpeg` (or `npm i ffmpeg-static` and use
`node_modules/ffmpeg-static/ffmpeg`).

```bash
cd demo

# 1. serve the page to a headless Chrome with CDP enabled
google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1280,800 \
  --remote-debugging-port=9222 --user-data-dir=/tmp/ss-profile \
  "file://$PWD/launch.html" &

# 2. capture one JPEG per frame (30 fps, deterministic) into ./frames
node record.mjs

# 3. synthesize the music bed (original, generated — no copyright)
node gen_music.mjs

# 4. encode
ffmpeg -y -framerate 30 -i frames/f%04d.jpg -i music.wav \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 160k -shortest -movflags +faststart slashslash-launch.mp4

# 5. (optional) README preview GIF
ffmpeg -y -i slashslash-launch.mp4 \
  -vf "fps=12,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" \
  slashslash-launch.gif
```

`frames/` and `music.wav` are build artifacts (gitignored).
