<template>
  <div v-if="r" class="kin">
    <template v-if="r.connected">
      <div class="big">
        <span :class="r.to.gender">{{ r.to.fullName }}</span> 是 <span :class="r.from.gender">{{ r.from.fullName }}</span> 的
        <b class="term">{{ r.termAtoB ?? '亲属' }}</b>
      </div>
      <div class="big">
        <span :class="r.from.gender">{{ r.from.fullName }}</span> 是 <span :class="r.to.gender">{{ r.to.fullName }}</span> 的
        <b class="term">{{ r.termBtoA ?? '亲属' }}</b>
      </div>
      <el-descriptions :column="1" border size="small" style="margin-top: 12px">
        <el-descriptions-item label="辈分">
          {{ r.generationDiffText }}
          <span v-if="r.from.generation && r.to.generation && !r.from.isExternal && !r.to.isExternal" class="muted">
            （第{{ r.from.generation }}世{{ r.from.generationChar ? '·' + r.from.generationChar + '字辈' : '' }} / 第{{ r.to.generation }}世{{ r.to.generationChar ? '·' + r.to.generationChar + '字辈' : '' }}）
          </span>
        </el-descriptions-item>
        <el-descriptions-item v-if="r.commonAncestor" label="共同祖先">
          <router-link :to="`/persons/${r.commonAncestor.id}`" class="link">{{ r.commonAncestor.fullName }}</router-link>
          <span v-if="r.commonAncestor.generation" class="muted">（第{{ r.commonAncestor.generation }}世）</span>
          <span class="muted"> · 距{{ r.from.fullName }} {{ r.stepsUpFromA }} 代，距{{ r.to.fullName }} {{ r.stepsUpFromB }} 代</span>
        </el-descriptions-item>
        <el-descriptions-item label="关系链">{{ r.from.fullName }}的{{ r.chainText }}</el-descriptions-item>
        <el-descriptions-item label="称谓来源">{{ SOURCE[r.source] }}</el-descriptions-item>
        <el-descriptions-item v-if="r.note" label="说明">{{ r.note }}</el-descriptions-item>
      </el-descriptions>
      <div class="path">
        <template v-for="(p, i) in r.path" :key="p.id">
          <router-link :to="`/persons/${p.id}`" class="node" :class="[p.gender, { end: i === 0 || i === r.path.length - 1 }]">
            {{ p.fullName }}
          </router-link>
          <span v-if="i < r.steps.length" class="arrow">{{ STEP[r.steps[i].kind] }}</span>
        </template>
      </div>
    </template>
    <el-result v-else icon="warning" title="未找到关系路径" :sub-title="r.generationDiffText" />
  </div>
</template>

<script setup lang="ts">
import type { KinshipResult } from '@zupu/shared';

defineProps<{ r: KinshipResult | null }>();
const SOURCE = { 'relationship.js': '标准称谓（relationship.js）', 'clan-rule': '族亲规则（出五服/远代直系）', chain: '暂无标准称谓，按关系链描述', self: '本人', none: '—' };
const STEP = { parent: '→父母→', child: '→子女→', spouse: '→配偶→' };
</script>

<style scoped>
.big { font-size: 16px; margin: 6px 0; }
.term { font-size: 22px; color: var(--zp-red); font-family: 'Songti SC', 'STSong', serif; margin-left: 4px; }
.path { margin-top: 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.node { padding: 2px 8px; border-radius: 4px; background: #f4efe4; font-size: 13px; }
.node.end { background: #fde3c4; font-weight: 600; }
.arrow { color: #aaa; font-size: 11px; }
.link { color: var(--zp-red); }
</style>
