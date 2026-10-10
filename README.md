# 老人识字

给没上过学、认字不多的老人用的手机识字站：点字听音、慢慢读句子、生字本复习。

## 本地预览

```bash
cd elder-read-site
python3 scripts/generate_audio.py   # 需 Mac say + ffmpeg
python3 -m http.server 8777
# http://127.0.0.1:8777
```

## 加课

编辑 `data/lessons.json`，再跑 `python3 scripts/generate_audio.py`。

## 上线

- 仓库：https://github.com/jepack/elder-read
- 手机打开：https://jepack.github.io/elder-read/

本目录是独立 git 仓库。推 `main` 后由 GitHub Pages（`main` 根目录）发布。