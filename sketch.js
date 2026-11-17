// ============================================================
// 角色動畫 (圖片精靈) - p5.js
// 操作：
//   A / D   : 向左 / 向右走路 (角色會朝向移動方向)
//   空白鍵  : 跳躍
//   滑鼠左鍵: 施放技能 (技能前方會出現特效)
// ============================================================

// ---------- ① 精靈圖設定 ----------
// frames: null  -> 自動偵測每一格 (依「完全透明的直行」切開，適合透明背景的橫向精靈圖)
// frames: 數字  -> 手動指定格數，圖片寬度平均切成 N 格
// 如果自動偵測切得不對，請直接改成正確的格數
const SPRITES = {
  walk:  { path: 'chara1/walk/walk.png',                 frames: 8,  fps: 12 },
  jump:  { path: 'chara1/jump/jump.png',                 frames: 13, fps: 16 },
  magic: { path: 'chara1/magic/magic.png',               frames: 4,  fps: 8  },
  fx:    { path: 'chara1/magic_effect/magic_effect.png', frames: 5,  fps: 15 },
};

// 自動偵測參數
const ALPHA_THRESHOLD = 10; // alpha 大於此值才算有像素
const MIN_GAP = 2;          // 連續幾排透明直行才算兩格之間的間隔
const MIN_FRAME_W = 8;      // 寬度小於此值的碎片會被忽略

// ---------- 背景設定 ----------
// ╔══════════════════════════════════════════════════════════╗
// ║  ★★★ 把你的背景圖片位置貼在下面三行的引號裡 ★★★          ║
// ║  路徑是「相對於 index.html」，例如：                      ║
// ║     'bg1.png'          (圖片和 index.html 在同一層)       ║
// ║     'bg/bg1.png'       (圖片在 bg 資料夾裡)               ║
// ║  ※ 不能貼 C:\Users\... 這種電腦完整路徑，瀏覽器讀不到   ║
// ║  執行時按 1 / 2 / 3 可切換背景                            ║
// ╚══════════════════════════════════════════════════════════╝
const BG_FILES = [
  'bg/bg1.png',   // ★ 背景 1 的位置貼這裡
  'bg/bg2.png',   // ★ 背景 2 的位置貼這裡
  'bg/bg3.png',   // ★ 背景 3 的位置貼這裡
];
// 若其中一個檔案其實是「三張併在一起」的 5410×1200 原圖，程式會自動切成三張
const SHEET_W = 5410, SHEET_H = 1200;
const SHEET_PANELS = [[32, 112], [1837, 112], [3642, 112]]; // 每張的左上角
const PANEL_W = 1736, PANEL_H = 976;
const BG_MIRROR = true; // true：相鄰的背景左右鏡像拼接，接縫不會突兀；false：直接重複

// 去除白邊 (原圖邊緣有一圈淺色殘邊，載入後自動清掉；不會修改你的 png 檔)
const REMOVE_HALO_FOR = ['walk', 'jump', 'magic']; // 要處理的精靈圖 (特效圖不處理)
const HALO_PASSES = 3;    // 由外往內清幾圈，白邊還在就加大，輪廓被吃掉就減小
const HALO_MIN_LIGHT = 140; // RGB 三個值都大於此值才算「淺色」
const HALO_MAX_SAT = 40;    // 最大與最小色差小於此值才算「偏白/灰」

// ---------- ② 其他參數 ----------
const CHAR_HEIGHT_RATIO = 1 / 3; // 角色高度 = 畫布高度的 1/3
const REF_SPRITE = 'walk';       // 以此精靈圖的高度當作「角色標準高度」
let SCALE = 1;                   // 放大倍率 (自動計算，等比例縮放，寬高比不變)
const SPRITE_FACES_RIGHT = true; // 原圖角色是否朝右？若原圖朝左請改成 false
const WALK_SPEED = 2.5;          // 走路速度 (以原圖像素為單位，會乘上 SCALE)
const GRAVITY = 0.45;            // 重力 (同上)
const JUMP_POWER = 9;            // 跳躍初速 (同上)
const MAGIC_FIRE_FRAME = 2;      // 施法動畫第幾格時放出特效 (從 0 開始)
const FX_SPEED = 5;              // 特效往前飛的速度 (同上)
const FX_LIFE = 90;              // 特效存活的 frame 數
const FX_OFFSET = 115;           // 特效中心與角色中心的水平距離 (原圖像素，會乘上 SCALE)
const FX_HEIGHT = 0.6;           // 特效高度 (佔施法角色高度的比例，從腳底算起)
const FX_SCALE = 1;              // 特效相對於角色的放大倍率

// ---------- 全域變數 ----------
let imgs = {};
let frameList = {}; // frameList[key] = [{sx, sw}, ...]
let player = {
  x: 0,
  y: 0,          // 腳底相對地面的高度偏移 (0 = 站在地上，負值 = 在空中)
  vy: 0,
  facing: 1,     // 1 = 右, -1 = 左
  state: 'idle', // idle / walk / jump / magic
  stateStart: 0,
  fired: false,
};
let effects = [];
let bgImgs = [];   // bgImgs[i] = 第 i 張背景 (載入完成前為 undefined)
let bgIndex = 0;
let bgFromSheet = false;

// ============================================================
function preload() {
  for (let key in SPRITES) {
    imgs[key] = loadImage(SPRITES[key].path);
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight); // 全螢幕
  noSmooth();
  for (let key of REMOVE_HALO_FOR) removeHalo(imgs[key]);
  for (let key in SPRITES) {
    frameList[key] = buildFrames(key);
    console.log(key + ' 偵測到 ' + frameList[key].length + ' 格', frameList[key]);
  }
  updateScale();
  loadBackgrounds();
  player.x = 0; // 角色在「世界」中的位置；畫面上角色固定在中央，由背景捲動
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateScale();
}

// ============================================================
// 背景載入 (依上方 BG_FILES 的路徑)
// ============================================================
function loadBackgrounds() {
  BG_FILES.forEach((path, i) => {
    loadImage(
      path,
      img => onBgLoaded(i, img, path),
      () => console.warn('背景載入失敗，請檢查 BG_FILES 的路徑：' + path)
    );
  });
}

function onBgLoaded(index, img, path) {
  console.log('背景 ' + (index + 1) + ' 載入成功：' + path);
  if (bgFromSheet) return;

  // 載入的是三張併在一起的原圖 -> 切成三張
  if (img.width === SHEET_W && img.height === SHEET_H) {
    bgImgs = SHEET_PANELS.map(([x, y]) => img.get(x, y, PANEL_W, PANEL_H));
    bgFromSheet = true;
    return;
  }
  bgImgs[index] = img;
}

// 角色高度固定為畫布高度的 1/3，寬度依原圖比例等比例縮放
function updateScale() {
  SCALE = (height * CHAR_HEIGHT_RATIO) / imgs[REF_SPRITE].height;
}

// ============================================================
// 去除白邊：由外往內，把「貼著透明區、顏色偏白或淺灰」的像素變成透明
// ============================================================
function removeHalo(img) {
  const w = img.width;
  const h = img.height;
  img.loadPixels();
  const px = img.pixels;

  for (let pass = 0; pass < HALO_PASSES; pass++) {
    const kill = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (px[i + 3] === 0) continue;

        const r = px[i], g = px[i + 1], b = px[i + 2];
        const lo = min(r, g, b);
        const hi = max(r, g, b);
        if (lo <= HALO_MIN_LIGHT || hi - lo >= HALO_MAX_SAT) continue; // 不是白邊色

        // 8 個鄰居中是否有透明像素
        let nearEmpty = false;
        for (let dy = -1; dy <= 1 && !nearEmpty; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (px[(ny * w + nx) * 4 + 3] === 0) { nearEmpty = true; break; }
          }
        }
        if (nearEmpty) kill.push(i);
      }
    }
    if (kill.length === 0) break;
    for (const i of kill) px[i + 3] = 0;
  }
  img.updatePixels();
}

// ============================================================
// 切割精靈圖
// ============================================================
function buildFrames(key) {
  const img = imgs[key];
  const cfg = SPRITES[key];
  const w = img.width;
  const h = img.height;
  const list = [];

  // 手動：平均切
  if (typeof cfg.frames === 'number') {
    const fw = w / cfg.frames;
    for (let i = 0; i < cfg.frames; i++) {
      list.push({ sx: i * fw, sw: fw });
    }
    return list;
  }

  // 自動：找出有像素的連續直行
  img.loadPixels();
  let start = -1;
  let lastFilled = -1;

  for (let x = 0; x < w; x++) {
    let filled = false;
    for (let y = 0; y < h; y++) {
      if (img.pixels[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD) {
        filled = true;
        break;
      }
    }
    if (filled) {
      if (start === -1) start = x;
      lastFilled = x;
    } else if (start !== -1 && x - lastFilled > MIN_GAP) {
      pushRun(list, start, lastFilled);
      start = -1;
    }
  }
  if (start !== -1) pushRun(list, start, lastFilled);

  // 偵測失敗 (例如圖片沒有透明背景) -> 整張當作 1 格
  if (list.length === 0) list.push({ sx: 0, sw: w });
  return list;
}

function pushRun(list, x0, x1) {
  const sw = x1 - x0 + 1;
  if (sw >= MIN_FRAME_W) list.push({ sx: x0, sw: sw });
}

// ============================================================
function draw() {
  const groundY = height * 0.8;

  updatePlayer();
  drawBackground();
  updateEffects();

  drawPlayer(groundY);
  drawEffects(groundY);

  fill(255);
  stroke(0);
  strokeWeight(3);
  textSize(16);
  textAlign(LEFT, TOP);
  text('A / D：左右移動　空白鍵：跳躍　滑鼠左鍵：施放技能　1 / 2 / 3：切換背景', 20, 20);
  noStroke();
}

// ============================================================
// 捲動式背景：背景高度 = 畫布高度，寬度依原圖比例；
// 依角色在世界中的位置 (player.x) 往左右無限拼接，角色往右走背景就往左捲
// ============================================================
function drawBackground() {
  // 選到的背景還沒載入 / 找不到時，改用任何一張已載入的
  const img = bgImgs[bgIndex] || bgImgs.find(b => b);
  if (!img) {
    background(30, 34, 48);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(18);
    text('找不到背景圖 bg1 / bg2 / bg3，請確認檔案放在 index.html 旁邊 (按 F12 看 Console)', width / 2, height / 2);
    return;
  }
  const bgH = height;
  const bgW = ceil(height * img.width / img.height);
  const left = player.x - width / 2; // 畫面左緣對應的世界座標

  background(0);
  for (let i = floor(left / bgW); i * bgW < left + width; i++) {
    const sx = round(i * bgW - left);
    const mirrored = BG_MIRROR && ((i % 2) + 2) % 2 === 1;
    if (mirrored) {
      push();
      translate(sx + bgW + 1, 0);
      scale(-1, 1);
      image(img, 0, 0, bgW + 1, bgH);
      pop();
    } else {
      image(img, sx, 0, bgW + 1, bgH);
    }
  }
}

// ============================================================
// 狀態與移動
// ============================================================
function setState(s) {
  if (player.state !== s) {
    player.state = s;
    player.stateStart = millis();
    if (s === 'magic') player.fired = false;
  }
}

function onGround() {
  return player.y >= 0;
}

function updatePlayer() {
  const left = keyIsDown(65);  // A
  const right = keyIsDown(68); // D

  // 施法中：不能移動，等動畫播完
  if (player.state === 'magic') {
    const n = frameList.magic.length;
    const elapsed = (millis() - player.stateStart) / 1000;
    const idx = floor(elapsed * SPRITES.magic.fps);

    if (!player.fired && idx >= min(MAGIC_FIRE_FRAME, n - 1)) {
      spawnEffect();
      player.fired = true;
    }
    if (idx >= n) {
      setState('idle');
    }
    return;
  }

  let moving = false;
  if (left && !right) {
    player.x -= WALK_SPEED * SCALE;
    player.facing = -1;
    moving = true;
  } else if (right && !left) {
    player.x += WALK_SPEED * SCALE;
    player.facing = 1;
    moving = true;
  }

  player.vy += GRAVITY * SCALE;
  player.y += player.vy;
  if (player.y >= 0) {
    player.y = 0;
    player.vy = 0;
  }


  if (!onGround()) {
    setState('jump');
  } else if (moving) {
    setState('walk');
  } else {
    setState('idle');
  }
}

function keyPressed() {
  if (key === '1' || key === '2' || key === '3') {
    bgIndex = int(key) - 1;
  }
  if (keyCode === 32) {
    if (onGround() && player.state !== 'magic') {
      player.vy = -JUMP_POWER * SCALE;
      player.y = -1;
      setState('jump');
    }
    return false; // 避免網頁捲動
  }
}

function mousePressed() {
  if (mouseButton === LEFT && onGround() && player.state !== 'magic') {
    setState('magic');
  }
}

// ============================================================
// 特效
// ============================================================
function maxFrameW(key) {
  let m = 0;
  for (let f of frameList[key]) m = max(m, f.sw);
  return m;
}

function spawnEffect() {
  effects.push({
    x: player.x + player.facing * FX_OFFSET * SCALE, // 角色前方
    dir: player.facing,
    born: millis(),
    life: FX_LIFE,
  });
}

function updateEffects() {
  for (let e of effects) {
    e.x += e.dir * FX_SPEED * SCALE;
    e.life--;
  }
  effects = effects.filter(e => e.life > 0 && abs(e.x - player.x) < width);
}

function drawEffects(groundY) {
  const img = imgs.fx;
  const frames = frameList.fx;
  const fh = img.height;
  const charH = imgs.magic.height * SCALE;

  for (let e of effects) {
    const idx = floor(((millis() - e.born) / 1000) * SPRITES.fx.fps) % frames.length;
    const f = frames[idx];

    push();
    translate(e.x - player.x + width / 2, groundY - charH * FX_HEIGHT); // 約在角色雙手高度
    scale(e.dir * (SPRITE_FACES_RIGHT ? 1 : -1), 1);
    image(
      img,
      -f.sw * SCALE * FX_SCALE / 2, -fh * SCALE * FX_SCALE / 2,
      f.sw * SCALE * FX_SCALE, fh * SCALE * FX_SCALE,
      f.sx, 0, f.sw, fh
    );
    pop();
  }
}

// ============================================================
// 繪製角色
// ============================================================
function drawPlayer(groundY) {
  let key, loop;
  switch (player.state) {
    case 'walk':  key = 'walk';  loop = true;  break;
    case 'jump':  key = 'jump';  loop = false; break;
    case 'magic': key = 'magic'; loop = false; break;
    default:      key = 'walk';  loop = true;  break; // 待機：顯示走路第 0 格
  }

  const img = imgs[key];
  const frames = frameList[key];
  const n = frames.length;
  const fh = img.height;

  let idx = 0;
  if (player.state !== 'idle') {
    const elapsed = (millis() - player.stateStart) / 1000;
    idx = floor(elapsed * SPRITES[key].fps);
    idx = loop ? idx % n : min(idx, n - 1);
  }
  const f = frames[idx];

  push();
  translate(width / 2, groundY + player.y); // 角色固定在畫面中央，原點在腳底
  scale(player.facing * (SPRITE_FACES_RIGHT ? 1 : -1), 1);
  image(
    img,
    -f.sw * SCALE / 2, -fh * SCALE,
    f.sw * SCALE, fh * SCALE,
    f.sx, 0, f.sw, fh
  );
  pop();
}