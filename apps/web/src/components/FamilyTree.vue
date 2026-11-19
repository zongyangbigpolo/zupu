<template>
  <div ref="el" class="tree-canvas" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Graph, type EdgeData, type NodeData } from '@antv/g6';
import {
  layoutFamilyTree,
  lifespanText,
  rankLabel,
  RELATION_TYPE_LABELS,
  type TreeEdge,
  type TreeNode,
  type TreeResponse,
} from '@zupu/shared';

const props = defineProps<{
  tree: TreeResponse | null;
  /** 亲属关系：已点选的人 */
  picked?: string[];
  /** 亲属关系：路径上的人（按顺序） */
  path?: string[];
}>();
const emit = defineEmits<{ (e: 'node-click', id: string): void }>();

const el = ref<HTMLDivElement>();
let graph: Graph | null = null;
let ready = false;

const W = 150;
const H = 62;

const COLORS = {
  male: { fill: '#eaf2ff', stroke: '#4a7fd6' },
  female: { fill: '#fdeef2', stroke: '#d65a7a' },
  unknown: { fill: '#f2f2f2', stroke: '#999' },
};

const edgeId = (e: Pick<TreeEdge, 'source' | 'target' | 'type'>) => `${e.type}:${e.source}:${e.target}`;

function nodeLabel(n: TreeNode) {
  const sub = [n.generation ? `第${n.generation}世` : n.isExternal ? '外姓' : '', n.generationChar ? `${n.generationChar}字辈` : '']
    .filter(Boolean)
    .join('·');
  return `${n.fullName}\n${sub || ' '}\n${lifespanText(n)}`;
}

/** 每个孩子只画"本支"父母的连线（外姓配偶到子女的线省略），祖先双亲都画 */
function visibleEdges(tree: TreeResponse): TreeEdge[] {
  const role = new Map(tree.nodes.map((n) => [n.id, n.role]));
  const byChild = new Map<string, TreeEdge[]>();
  const out: TreeEdge[] = [];
  for (const e of tree.edges) {
    if (e.type === 'spouse') out.push(e);
    else {
      if (!byChild.has(e.target)) byChild.set(e.target, []);
      byChild.get(e.target)!.push(e);
    }
  }
  for (const [child, es] of byChild) {
    const childRole = role.get(child);
    if (childRole === 'ancestor' || childRole === 'center') {
      out.push(...es);
      continue;
    }
    const lineage = es.filter((e) => role.get(e.source) !== 'spouse');
    out.push(...(lineage.length ? lineage : es));
  }
  return out;
}

function toData(tree: TreeResponse) {
  const { positions } = layoutFamilyTree(tree, { nodeWidth: W, nodeHeight: H, rowHeight: 116, hGap: 22, spouseGap: 12 });
  const nodes: NodeData[] = tree.nodes.map((n) => {
    const c = COLORS[n.gender] ?? COLORS.unknown;
    const isCenter = n.role === 'center';
    const badges: any[] = [];
    if (n.isLiving) badges.push({ text: '在世', placement: 'right-top', fill: '#fff', background: { fill: '#3a9b5c' }, fontSize: 9 });
    if (n.hasMoreUp) badges.push({ text: '▲', placement: 'top', fontSize: 9, background: { fill: '#8b1e1e' }, fill: '#fff' });
    if (n.hasMoreDown) badges.push({ text: '▼', placement: 'bottom', fontSize: 9, background: { fill: '#8b1e1e' }, fill: '#fff' });
    return {
      id: n.id,
      data: n as unknown as Record<string, unknown>,
      style: {
        x: positions[n.id]?.x ?? 0,
        y: positions[n.id]?.y ?? 0,
        size: [W, H],
        radius: 6,
        fill: isCenter ? '#fff6dc' : c.fill,
        stroke: isCenter ? '#c9a45c' : c.stroke,
        lineWidth: isCenter ? 3 : 1.2,
        opacity: 1,
        labelText: nodeLabel(n),
        labelPlacement: 'center',
        labelFontSize: 11.5,
        labelLineHeight: 17,
        labelFill: n.isLiving ? '#1d1d1d' : '#444',
        labelFontWeight: isCenter ? 'bold' : 'normal',
        labelTextAlign: 'center',
        badges,
        cursor: 'pointer',
      },
    };
  });
  const edges: EdgeData[] = visibleEdges(tree).map((e) => {
    const side = e.type === 'parent' && !e.isMainLine;
    const special = e.type === 'parent' && e.relationType && e.relationType !== 'biological';
    return {
      id: edgeId(e),
      source: e.source,
      target: e.target,
      type: e.type === 'spouse' ? 'line' : 'cubic-vertical',
      data: e as unknown as Record<string, unknown>,
      style: {
        stroke: e.type === 'spouse' ? '#c9a45c' : side ? '#bbb' : '#8d7b68',
        lineWidth: e.type === 'spouse' ? 2 : 1.3,
        lineDash: side ? [5, 4] : e.type === 'spouse' ? [2, 2] : undefined,
        labelText: side ? '生父(出继)' : special ? RELATION_TYPE_LABELS[e.relationType!] : undefined,
        labelFontSize: 10,
        labelFill: '#8b1e1e',
        labelBackground: true,
        labelBackgroundFill: '#fffdf7',
      },
    };
  });
  return { nodes, edges };
}

function tooltipHtml(n: TreeNode) {
  const g = n.gender === 'male' ? '男' : n.gender === 'female' ? '女' : '';
  const lines = [
    `<b style="font-size:14px">${n.fullName}</b> <span style="color:#888">${g}</span>`,
    n.generation ? `第${n.generation}世${n.generationChar ? ` · ${n.generationChar}字辈` : ''}${n.rankInSiblings ? ` · ${rankLabel(n.rankInSiblings)}` : ''}` : n.isExternal ? '外姓' : '',
    `生：${n.birthText ?? '—'}`,
    n.isLiving ? '<span style="color:#3a9b5c">在世</span>' : `卒：${n.deathText ?? '—'}`,
    '<span style="color:#999">点击以此人为中心</span>',
  ];
  return `<div style="line-height:1.7">${lines.filter(Boolean).join('<br/>')}</div>`;
}

async function render() {
  ready = false;
  graph?.destroy();
  graph = null;
  if (!el.value || !props.tree) return;
  const tree = props.tree;
  graph = new Graph({
    container: el.value,
    autoResize: true,
    background: '#fffdf7',
    data: toData(tree),
    node: {
      type: 'rect',
      state: {
        picked: { stroke: '#e67e22', lineWidth: 4, halo: true, haloStroke: '#f5b041', haloLineWidth: 10 },
        highlight: { stroke: '#e67e22', lineWidth: 3, halo: true, haloStroke: '#f8c471', haloLineWidth: 8 },
        dim: { opacity: 0.25 },
      },
    },
    edge: {
      state: {
        highlight: { stroke: '#e67e22', lineWidth: 3.5, lineDash: 0 },
        dim: { opacity: 0.15 },
      },
    },
    behaviors: ['drag-canvas', 'zoom-canvas'],
    plugins: [
      {
        type: 'tooltip',
        enable: (e: any) => e.targetType === 'node',
        getContent: async (_e: any, items: any[]) => tooltipHtml(items[0]?.data as TreeNode),
      },
    ],
  });
  graph.on('node:click', (evt: any) => emit('node-click', evt.target.id));
  await graph.render();
  await graph.fitView();
  if (graph.getZoom() > 1.1) await graph.zoomTo(1.1);
  // 节点很多时整体缩放会太小：保持可读的缩放比例，并把中心人物移到视野中央
  if (graph.getZoom() < 0.7) {
    await graph.zoomTo(0.9);
    await graph.focusElement(tree.centerId);
  }
  ready = true;
  applyStates();
}

function applyStates() {
  if (!graph || !ready || !props.tree) return;
  const states: Record<string, string[]> = {};
  const path = props.path ?? [];
  const pathSet = new Set(path);
  const hasPath = path.length > 1;
  for (const n of props.tree.nodes) {
    const s: string[] = [];
    if (props.picked?.includes(n.id)) s.push('picked');
    else if (pathSet.has(n.id)) s.push('highlight');
    else if (hasPath) s.push('dim');
    states[n.id] = s;
  }
  const pathEdges = new Set<string>();
  for (let i = 0; i + 1 < path.length; i++) {
    const [a, b] = [path[i], path[i + 1]];
    for (const t of ['parent', 'spouse'] as const) {
      pathEdges.add(edgeId({ source: a, target: b, type: t }));
      pathEdges.add(edgeId({ source: b, target: a, type: t }));
    }
  }
  for (const e of graph.getEdgeData()) {
    states[e.id!] = pathEdges.has(e.id!) ? ['highlight'] : hasPath ? ['dim'] : [];
  }
  graph.setElementState(states, false);
  if (hasPath) graph.fitView();
}

/** 导出整张树为 PNG */
async function exportImage(filename: string) {
  if (!graph) return;
  const url = await graph.toDataURL({ mode: 'overall', type: 'image/png' });
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

async function fit() {
  await graph?.fitView();
}
async function focusCenter() {
  if (props.tree) await graph?.focusElement(props.tree.centerId);
}

defineExpose({ exportImage, fit, focusCenter });

watch(() => props.tree, render);
watch(() => [props.picked, props.path], applyStates, { deep: true });
onMounted(render);
onBeforeUnmount(() => graph?.destroy());
</script>

<style scoped>
.tree-canvas { width: 100%; height: 100%; }
</style>
