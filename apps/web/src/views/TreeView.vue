<template>
  <div class="wrap">
    <div class="toolbar">
      <el-button v-if="person" text :icon="'Back'" @click="router.push(`/clans/${person.clanId}`)">{{ clan?.name ?? '家族首页' }}</el-button>
      <el-divider direction="vertical" />
      <span v-if="person" class="center-name title-serif">
        <router-link :to="`/persons/${person.id}`">{{ person.fullName }}</router-link>
        <small class="muted"> {{ person.disambiguation }}</small>
      </span>
      <span class="muted">五代树</span>
      <div class="grow" />
      <span class="muted">上</span>
      <el-input-number v-model="up" :min="0" :max="10" size="small" style="width: 90px" />
      <span class="muted">下</span>
      <el-input-number v-model="down" :min="0" :max="10" size="small" style="width: 90px" />
      <el-radio-group v-model="line" size="small">
        <el-radio-button value="main">宗法主线</el-radio-button>
        <el-radio-button value="birth">生父线</el-radio-button>
      </el-radio-group>
      <el-button size="small" :type="pickMode ? 'warning' : 'default'" :icon="'Connection'" @click="togglePick">
        {{ pickMode ? '点选两人中…' : '查亲属关系' }}
      </el-button>
      <el-button v-if="clan?.myLinkedPersonId && clan.myLinkedPersonId !== id" size="small" :icon="'User'" @click="router.push(`/persons/${clan.myLinkedPersonId}/tree`)">
        以我为中心
      </el-button>
      <el-button size="small" :icon="'FullScreen'" @click="treeRef?.fit()">适应屏幕</el-button>
      <el-button size="small" :icon="'Download'" @click="exportImg">导出图片</el-button>
    </div>
    <div class="body">
      <div class="canvas" v-loading="loading">
        <FamilyTree ref="treeRef" :tree="tree" :picked="picked" :path="pathIds" @node-click="onNodeClick" />
        <div class="legend">
          <span><i class="box male" />男</span>
          <span><i class="box female" />女</span>
          <span><i class="box center" />中心人物</span>
          <span><i class="badge">在世</i>在世</span>
          <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#c9a45c" stroke-width="2" stroke-dasharray="2 2" /></svg>婚姻</span>
          <span><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#bbb" stroke-width="2" stroke-dasharray="5 4" /></svg>生父（出继）</span>
          <span>▲▼ 还有更多上/下代</span>
        </div>
        <el-alert v-if="tree?.truncated" type="warning" :closable="false" class="trunc" title="后代过多，仅显示部分节点" />
        <div v-if="pickMode && picked.length < 2" class="hint">
          {{ picked.length === 0 ? '请点击第一位人物' : '请点击第二位人物' }}
        </div>
      </div>
      <div v-if="pickMode || kin" class="side">
        <div class="row">
          <span class="card-title grow">亲属关系</span>
          <el-button text :icon="'Close'" @click="closeKin" />
        </div>
        <p v-if="!kin" class="muted">在树上依次点击两人，即可显示两人的称谓、辈分差与关系路径。</p>
        <KinshipCard :r="kin" />
        <el-button v-if="kin && clan" style="margin-top: 12px" text type="danger" @click="router.push(`/clans/${clan.id}/kinship?from=${kin.from.id}&to=${kin.to.id}`)">
          在亲属关系工具中打开 →
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ClanWithRole, KinshipResult, PersonDetail, TreeLine, TreeResponse } from '@zupu/shared';
import { api, run } from '../api';
import FamilyTree from '../components/FamilyTree.vue';
import KinshipCard from '../components/KinshipCard.vue';

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;
const up = ref(Number(route.query.up ?? 5));
const down = ref(Number(route.query.down ?? 5));
const line = ref<TreeLine>((route.query.line as TreeLine) ?? 'main');
const tree = ref<TreeResponse | null>(null);
const person = ref<PersonDetail | null>(null);
const clan = ref<ClanWithRole | null>(null);
const loading = ref(false);
const treeRef = ref<InstanceType<typeof FamilyTree>>();
const pickMode = ref(route.query.pick === '1');
const picked = ref<string[]>([]);
const kin = ref<KinshipResult | null>(null);
const pathIds = computed(() => kin.value?.path.map((p) => p.id) ?? []);

async function load() {
  loading.value = true;
  tree.value = (await run(api.persons.tree(id, { up: up.value, down: down.value, line: line.value }))) ?? null;
  loading.value = false;
}

onMounted(async () => {
  person.value = (await run(api.persons.get(id))) ?? null;
  if (person.value) clan.value = (await run(api.clans.get(person.value.clanId))) ?? null;
  await load();
  // 支持链接直接带上两人：?pick=1&a=<id>&b=<id>
  const a = route.query.a as string | undefined;
  const b = route.query.b as string | undefined;
  if (a && b && clan.value) {
    pickMode.value = true;
    picked.value = [a, b];
    kin.value = (await run(api.clans.kinship(clan.value.id, a, b))) ?? null;
  }
});
watch([up, down, line], () => {
  router.replace({ query: { ...route.query, up: up.value, down: down.value, line: line.value } });
  load();
});

function togglePick() {
  pickMode.value = !pickMode.value;
  picked.value = [];
  kin.value = null;
}
function closeKin() {
  pickMode.value = false;
  picked.value = [];
  kin.value = null;
}

async function onNodeClick(nodeId: string) {
  if (!pickMode.value) {
    if (nodeId !== id) router.push({ path: `/persons/${nodeId}/tree`, query: { up: up.value, down: down.value, line: line.value } });
    return;
  }
  if (picked.value.length >= 2) {
    picked.value = [];
    kin.value = null;
  }
  picked.value = [...picked.value, nodeId];
  if (picked.value.length === 2 && clan.value) {
    kin.value = (await run(api.clans.kinship(clan.value.id, picked.value[0], picked.value[1]))) ?? null;
  }
}

function exportImg() {
  treeRef.value?.exportImage(`${person.value?.fullName ?? '族谱'}-五代树.png`);
}
</script>

<style scoped>
.wrap { display: flex; flex-direction: column; height: calc(100vh - 54px); }
.toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #fff; border-bottom: 1px solid #eee; flex-wrap: wrap; }
.center-name { font-size: 18px; color: var(--zp-red); }
.body { flex: 1; display: flex; min-height: 0; }
.canvas { flex: 1; position: relative; min-width: 0; }
.side { width: 380px; border-left: 1px solid #eee; background: #fff; padding: 14px; overflow: auto; }
.legend { position: absolute; left: 12px; bottom: 12px; background: rgba(255, 255, 255, 0.92); border: 1px solid #eee; border-radius: 6px; padding: 6px 10px; font-size: 12px; display: flex; gap: 12px; color: #555; }
.legend span { display: inline-flex; align-items: center; gap: 4px; }
.box { display: inline-block; width: 14px; height: 10px; border-radius: 2px; border: 1px solid; }
.box.male { background: #eaf2ff; border-color: #4a7fd6; }
.box.female { background: #fdeef2; border-color: #d65a7a; }
.box.center { background: #fff6dc; border: 2px solid #c9a45c; }
.badge { font-style: normal; background: #3a9b5c; color: #fff; font-size: 10px; padding: 0 3px; border-radius: 3px; }
.trunc { position: absolute; top: 10px; left: 10px; width: 300px; }
.hint { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); background: #e67e22; color: #fff; padding: 6px 16px; border-radius: 16px; font-size: 14px; }
</style>
