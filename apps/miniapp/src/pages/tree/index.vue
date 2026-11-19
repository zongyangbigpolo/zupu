<template>
  <view class="page">
    <view class="bar">
      <view class="grow" v-if="center">
        <text class="cname" :class="center.gender">{{ center.fullName }}</text>
        <text class="muted"> {{ center.generation ? `第${center.generation}世` : '' }}{{ center.generationChar ? ` · ${center.generationChar}字辈` : '' }}</text>
      </view>
      <view class="seg">
        <text :class="{ on: line === 'main' }" @click="switchLine('main')">宗法主线</text>
        <text :class="{ on: line === 'birth' }" @click="switchLine('birth')">生父线</text>
      </view>
    </view>

    <!-- #ifdef MP-WEIXIN -->
    <canvas type="2d" id="tree" class="cv" :style="{ height: cvHeight + 'px' }" @touchstart="onStart" @touchmove="onMove" @touchend="onEnd" @touchcancel="onEnd" />
    <!-- #endif -->
    <!-- #ifndef MP-WEIXIN -->
    <view id="tree-host" class="cv" :style="{ height: cvHeight + 'px' }" @touchstart="onStart" @touchmove.prevent="onMove" @touchend="onEnd" @touchcancel="onEnd" />
    <!-- #endif -->

    <view class="tools">
      <view class="tool" @click="zoomBy(1.25)">＋</view>
      <view class="tool" @click="zoomBy(0.8)">－</view>
      <view class="tool small" @click="fitCenter">居中</view>
      <view class="tool small" @click="history.length > 1 && back()" :class="{ disabled: history.length <= 1 }">后退</view>
    </view>

    <view class="foot">
      <text class="muted grow">单指拖动 · 双指缩放 · 点击人物换中心</text>
      <button class="btn" size="mini" @click="openDetail">查看档案</button>
    </view>
    <view v-if="loading" class="loading">加载中…</view>
  </view>
</template>

<script setup lang="ts">
import { getCurrentInstance, ref } from 'vue';
import { onLoad, onReady, onUnload } from '@dcloudio/uni-app';
import { layoutFamilyTree, type TreeLine, type TreeNode, type TreeResponse } from '@zupu/shared';
import { api, run } from '../../api';

const NODE_W = 92;
const NODE_H = 50;
const UP = ['', '父母', '祖父母', '曾祖', '高祖', '天祖'];
const DOWN = ['', '子女', '孙', '曾孙', '玄孙', '来孙'];

const instance = getCurrentInstance();
const sys = uni.getSystemInfoSync();
const dpr = sys.pixelRatio || 2;
const cvWidth = sys.windowWidth;
// windowHeight 已扣除导航栏；减去顶部工具条 44px 与底部操作栏 66px
const cvHeight = ref(Math.max(320, sys.windowHeight - 110));

const loading = ref(false);
const line = ref<TreeLine>('main');
const center = ref<TreeNode | null>(null);
const history = ref<string[]>([]);

let canvas: any = null;
let ctx: CanvasRenderingContext2D | null = null;
let tree: TreeResponse | null = null;
let pos: Record<string, { x: number; y: number }> = {};
let scale = 1;
let tx = 0;
let ty = 0;
let raf = 0;
let hostRect = { left: 0, top: 0 };
const cleanups: (() => void)[] = [];

// ---------- 数据 ----------
async function load(id: string, push = true) {
  loading.value = true;
  const r = await run(api.persons.tree(id, { up: 5, down: 5, line: line.value }));
  loading.value = false;
  if (!r) return;
  tree = r;
  pos = layoutFamilyTree(r, { nodeWidth: NODE_W, nodeHeight: NODE_H, hGap: 14, spouseGap: 8, rowHeight: 104 }).positions;
  center.value = r.nodes.find((n) => n.id === r.centerId) ?? null;
  if (push) history.value.push(id);
  uni.setNavigationBarTitle({ title: `${center.value?.fullName ?? ''} · 五代树` });
  fitCenter();
}

function switchLine(l: TreeLine) {
  if (line.value === l || !center.value) return;
  line.value = l;
  load(center.value.id, false);
}

function back() {
  history.value.pop();
  const id = history.value[history.value.length - 1];
  if (id) load(id, false);
}

function openDetail() {
  if (center.value) uni.navigateTo({ url: `/pages/person/detail?id=${center.value.id}` });
}

// ---------- 视图变换 ----------
function fitCenter() {
  if (!tree) return;
  const c = pos[tree.centerId] ?? { x: 0, y: 0 };
  scale = Math.min(1.1, Math.max(0.6, cvWidth / 420));
  tx = cvWidth / 2 - c.x * scale;
  ty = cvHeight.value / 2 - c.y * scale;
  draw();
}

function zoomAt(f: number, cx: number, cy: number) {
  const ns = Math.min(2.5, Math.max(0.2, scale * f));
  const k = ns / scale;
  tx = cx - (cx - tx) * k;
  ty = cy - (cy - ty) * k;
  scale = ns;
  draw();
}
const zoomBy = (f: number) => zoomAt(f, cvWidth / 2, cvHeight.value / 2);

// ---------- 绘制 ----------
function draw() {
  if (raf || !ctx) return;
  const schedule = canvas?.requestAnimationFrame ? (fn: () => void) => canvas.requestAnimationFrame(fn) : (fn: () => void) => setTimeout(fn, 16);
  raf = 1;
  schedule(() => {
    raf = 0;
    render();
  });
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function render() {
  const c = ctx!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#faf6ee';
  c.fillRect(0, 0, cvWidth, cvHeight.value);
  if (!tree) return;

  // 层级标签（固定在左侧）
  const cy0 = pos[tree.centerId]?.y ?? 0;
  c.font = '11px sans-serif';
  c.fillStyle = 'rgba(138,109,59,0.55)';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  const depths = new Set(tree.nodes.map((n) => n.depth));
  for (const d of depths) {
    const label = d === 0 ? '本人' : d < 0 ? UP[-d] : DOWN[d];
    if (!label) continue;
    const y = ty + (cy0 + d * 104) * scale;
    if (y > -20 && y < cvHeight.value + 20) c.fillText(label, 6, y);
  }

  c.save();
  c.translate(tx, ty);
  c.scale(scale, scale);

  // 连线
  c.lineWidth = 1.2 / Math.max(scale, 0.5);
  for (const e of tree.edges) {
    const a = pos[e.source];
    const b = pos[e.target];
    if (!a || !b) continue;
    c.beginPath();
    if (e.type === 'spouse') {
      c.strokeStyle = '#c9a45c';
      c.setLineDash([4, 3]);
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
    } else {
      c.strokeStyle = e.isMainLine === false ? '#bbb' : '#a0522d';
      c.setLineDash(e.isMainLine === false ? [4, 3] : []);
      const midY = (a.y + NODE_H / 2 + b.y - NODE_H / 2) / 2;
      c.moveTo(a.x, a.y + NODE_H / 2);
      c.lineTo(a.x, midY);
      c.lineTo(b.x, midY);
      c.lineTo(b.x, b.y - NODE_H / 2);
    }
    c.stroke();
  }
  c.setLineDash([]);

  // 节点
  for (const n of tree.nodes) {
    const p = pos[n.id];
    if (!p) continue;
    const x = p.x - NODE_W / 2;
    const y = p.y - NODE_H / 2;
    const male = n.gender === 'male';
    const female = n.gender === 'female';
    const isCenter = n.id === tree.centerId;
    roundRect(c, x, y, NODE_W, NODE_H, 6);
    c.fillStyle = isCenter ? '#8b1e1e' : n.isLiving ? (male ? '#e8f0fc' : female ? '#fdebf0' : '#f5f5f5') : male ? '#dde4ee' : female ? '#efe0e4' : '#e8e8e8';
    c.fill();
    c.lineWidth = isCenter ? 2 : 1;
    c.strokeStyle = isCenter ? '#5a0f0f' : male ? '#2f6fd6' : female ? '#d14d72' : '#999';
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = isCenter ? '#fff' : '#222';
    c.font = 'bold 14px sans-serif';
    c.fillText(n.fullName.length > 5 ? n.fullName.slice(0, 5) + '…' : n.fullName, p.x, p.y - 8);
    c.font = '10px sans-serif';
    c.fillStyle = isCenter ? '#f6d99b' : '#777';
    const sub = n.isExternal && n.role === 'spouse' ? '配偶' : [n.generation ? `${n.generation}世` : '', n.generationChar ?? '', n.isLiving ? '' : '故'].filter(Boolean).join('·');
    c.fillText(sub, p.x, p.y + 11);
    if (n.hasMoreUp && n.depth === -tree.up) c.fillText('⋯', p.x, y - 8);
    if (n.hasMoreDown && n.depth === tree.down) c.fillText('⋯', p.x, y + NODE_H + 8);
  }
  c.restore();
}

function hit(sx: number, sy: number): TreeNode | null {
  if (!tree) return null;
  const x = (sx - tx) / scale;
  const y = (sy - ty) / scale;
  for (const n of tree.nodes) {
    const p = pos[n.id];
    if (p && Math.abs(x - p.x) <= NODE_W / 2 && Math.abs(y - p.y) <= NODE_H / 2) return n;
  }
  return null;
}

// ---------- 手势 ----------
type Pt = { x: number; y: number };
let start: { pts: Pt[]; tx: number; ty: number; scale: number; time: number } | null = null;
let moved = false;

function points(e: any): Pt[] {
  return Array.from(e.touches ?? []).map((t: any) =>
    t.x !== undefined ? { x: t.x, y: t.y } : { x: t.clientX - hostRect.left, y: t.clientY - hostRect.top },
  );
}

function onStart(e: any) {
  const pts = points(e);
  if (!pts.length) return;
  start = { pts, tx, ty, scale, time: Date.now() };
  moved = pts.length > 1;
}

function onMove(e: any) {
  if (!start) return;
  const pts = points(e);
  if (pts.length >= 2 && start.pts.length >= 2) {
    const d0 = Math.hypot(start.pts[0].x - start.pts[1].x, start.pts[0].y - start.pts[1].y) || 1;
    const d1 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const m0 = { x: (start.pts[0].x + start.pts[1].x) / 2, y: (start.pts[0].y + start.pts[1].y) / 2 };
    const m1 = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const ns = Math.min(2.5, Math.max(0.2, start.scale * (d1 / d0)));
    const k = ns / start.scale;
    scale = ns;
    tx = m1.x - (m0.x - start.tx) * k;
    ty = m1.y - (m0.y - start.ty) * k;
    moved = true;
  } else if (pts.length === 1 && start.pts.length === 1) {
    const dx = pts[0].x - start.pts[0].x;
    const dy = pts[0].y - start.pts[0].y;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    tx = start.tx + dx;
    ty = start.ty + dy;
  } else {
    start = { pts, tx, ty, scale, time: Date.now() };
  }
  draw();
}

function onEnd(e: any) {
  if (start && !moved && start.pts.length === 1 && Date.now() - start.time < 400) {
    const n = hit(start.pts[0].x, start.pts[0].y);
    if (n && tree && n.id !== tree.centerId) load(n.id);
  }
  // 双指抬起一指时，以剩下的一指重新开始拖动
  const rest = points(e);
  start = rest.length ? { pts: rest, tx, ty, scale, time: Date.now() } : null;
  if (rest.length) moved = true;
}

// ---------- 画布初始化 ----------
function initCanvas(): Promise<void> {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni
      .createSelectorQuery()
      .in(instance?.proxy)
      .select('#tree')
      .fields({ node: true, size: true } as any, () => {})
      .exec((res: any[]) => {
        canvas = res[0]?.node;
        if (!canvas) return resolve();
        canvas.width = cvWidth * dpr;
        canvas.height = cvHeight.value * dpr;
        ctx = canvas.getContext('2d');
        resolve();
      });
    // #endif
    // #ifndef MP-WEIXIN
    const host = document.getElementById('tree-host')!;
    const el = document.createElement('canvas');
    el.width = cvWidth * dpr;
    el.height = cvHeight.value * dpr;
    el.style.width = cvWidth + 'px';
    el.style.height = cvHeight.value + 'px';
    el.style.display = 'block';
    host.appendChild(el);
    canvas = el;
    ctx = el.getContext('2d');
    const rect = () => (hostRect = host.getBoundingClientRect());
    rect();
    window.addEventListener('resize', rect);
    window.addEventListener('scroll', rect, true);
    // 桌面浏览器：鼠标拖动、滚轮缩放
    let drag: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;
    const down = (ev: MouseEvent) => (drag = { x: ev.clientX, y: ev.clientY, tx, ty, moved: false });
    const move = (ev: MouseEvent) => {
      if (!drag) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      tx = drag.tx + dx;
      ty = drag.ty + dy;
      draw();
    };
    const up = (ev: MouseEvent) => {
      if (drag && !drag.moved) {
        rect();
        const n = hit(ev.clientX - hostRect.left, ev.clientY - hostRect.top);
        if (n && tree && n.id !== tree.centerId) load(n.id);
      }
      drag = null;
    };
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      rect();
      zoomAt(ev.deltaY < 0 ? 1.1 : 0.9, ev.clientX - hostRect.left, ev.clientY - hostRect.top);
    };
    el.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    el.addEventListener('wheel', wheel, { passive: false });
    cleanups.push(() => {
      window.removeEventListener('resize', rect);
      window.removeEventListener('scroll', rect, true);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    });
    resolve();
    // #endif
  });
}

let pendingId = '';
onLoad((q) => {
  pendingId = (q as any).id;
});
onReady(async () => {
  await initCanvas();
  if (pendingId) load(pendingId);
});
onUnload(() => cleanups.forEach((f) => f()));
</script>

<style scoped>
.page { position: relative; height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px)); overflow: hidden; background: #faf6ee; }
.bar { display: flex; align-items: center; gap: 12rpx; height: 44px; padding: 0 24rpx; background: #fff; border-bottom: 1px solid #f0e6d2; box-sizing: border-box; }
.cname { font-size: 32rpx; font-weight: 600; }
.seg { display: flex; border: 1px solid #8b1e1e; border-radius: 8rpx; overflow: hidden; font-size: 22rpx; }
.seg text { padding: 6rpx 14rpx; color: #8b1e1e; }
.seg .on { background: #8b1e1e; color: #fff; }
.cv { width: 100%; display: block; }
.tools { position: absolute; right: 24rpx; top: 60px; display: flex; flex-direction: column; gap: 16rpx; }
.tool { width: 72rpx; height: 72rpx; line-height: 72rpx; text-align: center; background: rgba(255, 255, 255, 0.92); border: 1px solid #e0d2b4; border-radius: 12rpx; color: #8b1e1e; font-size: 36rpx; }
.tool.small { font-size: 22rpx; }
.tool.disabled { color: #ccc; }
.foot { position: absolute; left: 0; right: 0; bottom: 0; height: 66px; display: flex; align-items: center; gap: 16rpx; padding: 0 24rpx; background: #fff; border-top: 1px solid #f0e6d2; box-sizing: border-box; }
.foot button { margin: 0; }
.loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0, 0, 0, 0.6); color: #fff; padding: 16rpx 32rpx; border-radius: 12rpx; }
</style>
