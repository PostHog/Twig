# ImageMagick Commands Reference

## Garden dithered background (vivid pixely)

```bash
magick public/garden.jpg -modulate 100,200,100 -resize 20% -ordered-dither o2x2,4 -scale 500% public/garden-dithered.jpg
```

- `-modulate 100,200,100` - Boost saturation to 200% for vivid colors
- `-resize 20%` - Downscale to 20% before dithering for pixely effect
- `-ordered-dither o2x2,4` - 2x2 Bayer matrix with 4 levels
- `-scale 500%` - Scale back up with nearest neighbor (keeps hard pixel edges)

## Tree branch

```bash
magick public/tree-branch.png -flip -resize 25% -ordered-dither o4x4,3 -resize 400% -fuzz 10% -transparent white public/tree-branch-dithered.png
```

- `-flip` - Flip vertically
- `-resize 25%` / `-resize 400%` - Downscale/upscale for coarse dither
- `-ordered-dither o4x4,3` - 4x4 Bayer matrix with 3 levels
- `-fuzz 10% -transparent white` - Make white (and near-white) transparent

## Shrike bird ornament (transparent background)

```bash
magick public/shrike.jpg -resize 20% -ordered-dither o2x2,4 -scale 500% \( +clone -colorspace HSL -channel L -separate +channel -threshold 80% -negate \) -alpha off -compose copy_opacity -composite -trim +repage public/shrike-dithered-v3.png
```

- `-resize 20%` - Downscale for pixely effect
- `-ordered-dither o2x2,4` - 2x2 Bayer matrix with 4 levels
- `-scale 500%` - Scale back up with nearest neighbor
- `\( +clone ... \)` - Creates a mask from the lightness channel
- `-colorspace HSL -channel L -separate` - Extract lightness channel
- `-threshold 80%` - Anything lighter than 80% becomes white (will be transparent)
- `-negate` - Invert so light areas become black (transparent)
- `-compose copy_opacity -composite` - Apply the mask as transparency
- `-trim +repage` - Remove transparent edges and reset canvas

Source: https://www.oldbookillustrations.com/illustrations/woodchat-shrike/
