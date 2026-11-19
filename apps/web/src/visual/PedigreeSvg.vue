<template>
  <svg class="pedigree" :width="chart.width * zoom" :height="chart.height * zoom" :viewBox="`0 0 ${chart.width} ${chart.height}`" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" :width="chart.width" :height="chart.height" fill="#fbf6ea" />
    <rect x="4" y="4" :width="chart.width - 8" :height="chart.height - 8" fill="none" stroke="#8b1e1e" stroke-width="2" />
    <rect x="8" y="8" :width="chart.width - 16" :height="chart.height - 16" fill="none" stroke="#8b1e1e" stroke-width="0.6" />
    <g v-if="chart.style === 'ou'">
      <template v-for="b in chart.bands" :key="b.label">
        <line x1="8" :x2="chart.width - 8" :y1="b.y" :y2="b.y" stroke="#c9a45c" stroke-width="0.6" />
        <text
          v-for="(ch, i) in [...b.label]"
          :key="i"
          :x="chart.width - chart.labelWidth / 2"
          :y="b.y + b.height / 2 - ([...b.label].length * 13) / 2 + i * 13 + 11"
          font-size="13"
          text-anchor="middle"
          fill="#8b1e1e"
          class="serif"
        >{{ ch }}</text>
      </template>
      <line v-if="last" x1="8" :x2="chart.width - 8" :y1="last.y + last.height" :y2="last.y + last.height" stroke="#c9a45c" stroke-width="0.6" />
      <line :x1="chart.width - chart.labelWidth" :x2="chart.width - chart.labelWidth" :y1="chart.bands[0]?.y ?? 0" :y2="last ? last.y + last.height : chart.height" stroke="#c9a45c" stroke-width="0.6" />
    </g>
    <polyline v-for="(l, i) in chart.lines" :key="'l' + i" :points="l.map((p) => p.join(',')).join(' ')" fill="none" stroke="#222" stroke-width="1" />
    <g v-for="n in chart.nodes" :key="n.id" class="node" @click="emit('person', n.id)">
      <title>{{ n.person.surname + n.person.givenName }}</title>
      <rect :x="n.x0 - 2" :y="n.y - 2" :width="n.x1 - n.x0 + 4" :height="n.nameBottom - n.y + 4" fill="transparent" />
      <template v-for="(c, ci) in n.columns" :key="ci">
        <text
          v-for="(ch, i) in [...c.text]"
          :key="i"
          :x="c.x"
          :y="c.y + i * c.size + c.size * 0.86"
          :font-size="c.size"
          text-anchor="middle"
          :fill="c.kind === 'name' ? (n.id === rootId ? '#8b1e1e' : '#1a1a1a') : '#555'"
          :font-weight="c.kind === 'name' ? 600 : 400"
          class="serif"
        >{{ ch }}</text>
      </template>
      <text v-if="n.continues" :x="n.anchorX" :y="n.nameBottom + 12" font-size="9" text-anchor="middle" fill="#8b1e1e">↓下接</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PedigreeChart } from '@zupu/shared';

const props = defineProps<{ chart: PedigreeChart; zoom: number; rootId?: string }>();
const emit = defineEmits<{ (e: 'person', id: string): void }>();
const last = computed(() => props.chart.bands[props.chart.bands.length - 1]);
</script>

<style scoped>
.pedigree { display: block; direction: ltr; }
.serif { font-family: 'Songti SC', 'STSong', 'Noto Serif CJK SC', 'Source Han Serif SC', 'SimSun', serif; }
.node { cursor: pointer; }
.node:hover text { fill: #c0392b; }
</style>
