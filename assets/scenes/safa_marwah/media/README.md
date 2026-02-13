Safa-Marwah media mapping

This folder holds scene-specific videos and audio used by the `safa_marwah` scene.

Expected filenames (add your media here):

Videos:
- media/videos/safa1.mp4        # existing
- media/videos/safa2.mp4        # optional
- media/videos/safa3.mp4        # optional
- media/videos/run_start.mp4    # NEW: video for the running start point (between Safa and Marwah)
- media/videos/marwah1.mp4      # video for Marwah (add if missing)

Audio:
- media/audio/safa1.mp3
- media/audio/RunGreenLights.mp3  # running audio used for the running-start point
- media/audio/marwah1.mp3

Notes:
- Filenames in `config/points.json` reference the paths above (relative to the scene folder).
- If a referenced file is missing the browser console / Network tab will show 404s; add the correct file names to avoid errors.
- For large files (>50MB) use Git LFS to track them.
