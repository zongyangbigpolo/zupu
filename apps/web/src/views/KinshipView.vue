<template>
  <div class="page" v-if="clan">
    <el-page-header @back="router.push(`/clans/${clanId}`)" :title="clan.name">
      <template #content><span class="title-serif" style="font-size: 20px">亲属关系查询</span></template>
    </el-page-header>

    <el-card shadow="never" style="margin-top: 16px">
      <div class="pick">
        <div class="side">
          <div class="muted">甲</div>
          <PersonPicker v-model="from" :clan-id="clanId" :initial="fromInit" placeholder="搜索第一个人" />
          <el-button v-if="me && from !== me" link size="small" @click="setMe">选择"我"</el-button>
        </div>
        <el-button circle :icon="'Switch'" @click="swap" title="交换" />
        <div class="side">
          <div class="muted">乙</div>
          <PersonPicker v-model="to" :clan-id="clanId" :initial="toInit" placeholder="搜索第二个人" />
        </div>
        <el-button type="danger" size="large" :disabled="!from || !to" :loading="busy" @click="compute">查询关系</el-button>
      </div>
      <p class="muted">也可以在
        <router-link v-if="from" :to="`/persons/${from}/tree?pick=1`" class="link">五代树</router-link><span v-else>五代树</span>
        上开启"查亲属关系"，直接点选两人。</p>
    </el-card>

    <el-row :gutter="16" v-if="r" style="margin-top: 16px">
      <el-col :md="12" :xs="24">
        <el-card shadow="never"><KinshipCard :r="r" /></el-card>
      </el-col>
      <el-col :md="12" :xs="24">
        <el-card shadow="never">
          <template #header><span class="card-title">关系路径图</span></template>
          <div v-if="vshape" class="vshape">
            <div class="apex">
              <router-link :to="`/persons/${vshape.apex.id}`" class="pnode apex-node" :class="vshape.apex.gender">
                {{ vshape.apex.fullName }}<small v-if="vshape.apex.generation">第{{ vshape.apex.generation }}世</small>
              </router-link>
              <div class="muted" style="text-align: center">共同祖先</div>
            </div>
            <div class="legs">
              <div class="leg">
                <template v-for="(n, i) in vshape.left" :key="n.id">
                  <div class="vline" />
                  <router-link :to="`/persons/${n.id}`" class="pnode" :class="[n.gender, { end: i === vshape.left.length - 1 }]">
                    {{ n.fullName }}<small v-if="n.generation">第{{ n.generation }}世</small>
                  </router-link>
                </template>
                <div v-if="!vshape.left.length" class="muted" style="text-align: center; margin-top: 8px">（甲即共同祖先）</div>
              </div>
              <div class="leg">
                <template v-for="(n, i) in vshape.right" :key="n.id">
                  <div class="vline" />
                  <router-link :to="`/persons/${n.id}`" class="pnode" :class="[n.gender, { end: i === vshape.right.length - 1 }]">
                    {{ n.fullName }}<small v-if="n.generation">第{{ n.generation }}世</small>
                  </router-link>
                </template>
                <div v-if="!vshape.right.length" class="muted" style="text-align: center; margin-top: 8px">（乙即共同祖先）</div>
              </div>
            </div>
          </div>
          <div v-else class="linear">
            <template v-for="(n, i) in r.path" :key="n.id">
              <router-link :to="`/persons/${n.id}`" class="pnode" :class="[n.gender, { end: i === 0 || i === r.path.length - 1 }]">{{ n.fullName }}</router-link>
              <div v-if="i < r.steps.length" class="step">{{ STEP[r.steps[i].kind] }}</div>
            </template>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ClanWithRole, KinshipResult, PersonBrief } from '@zupu/shared';
import { api, run } from '../api';
import KinshipCard from '../components/KinshipCard.vue';
import PersonPicker from '../components/PersonPicker.vue';

const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const clan = ref<ClanWithRole | null>(null);
const from = ref<string | null>((route.query.from as string) || null);
const to = ref<string | null>((route.query.to as string) || null);
const fromInit = ref<{ id: string; fullName: string } | null>(null);
const toInit = ref<{ id: string; fullName: string } | null>(null);
const r = ref<KinshipResult | null>(null);
const busy = ref(false);
const me = computed(() => clan.value?.myLinkedPersonId ?? null);
const STEP = { parent: '↑ 父母', child: '↓ 子女', spouse: '↔ 配偶' };

/** 纯血缘路径画成"人"字形：顶点为共同祖先，左腿到甲，右腿到乙 */
const vshape = computed(() => {
  const k = r.value;
  if (!k?.connected || k.stepsUpFromA == null || k.stepsUpFromB == null) return null;
  const m = k.stepsUpFromA;
  const apex = k.path[m];
  const left: PersonBrief[] = k.path.slice(0, m).reverse();
  const right: PersonBrief[] = k.path.slice(m + 1);
  return { apex, left, right };
});

async function brief(id: string | null) {
  if (!id) return null;
  const p = await run(api.persons.get(id));
  return p ? { id: p.id, fullName: p.fullName } : null;
}

async function compute() {
  if (!from.value || !to.value) return;
  busy.value = true;
  router.replace({ query: { from: from.value, to: to.value } });
  r.value = (await run(api.clans.kinship(clanId, from.value, to.value))) ?? null;
  busy.value = false;
}
function swap() {
  [from.value, to.value] = [to.value, from.value];
  [fromInit.value, toInit.value] = [toInit.value, fromInit.value];
  if (r.value) compute();
}
async function setMe() {
  from.value = me.value;
  fromInit.value = await brief(me.value);
}

onMounted(async () => {
  clan.value = (await run(api.clans.get(clanId))) ?? null;
  if (!from.value && me.value) from.value = me.value;
  [fromInit.value, toInit.value] = await Promise.all([brief(from.value), brief(to.value)]);
  if (from.value && to.value) compute();
});
</script>

<style scoped>
.pick { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.side { flex: 1; min-width: 220px; }
.link { color: var(--zp-red); }
.vshape { display: flex; flex-direction: column; align-items: center; }
.legs { display: flex; gap: 40px; justify-content: center; }
.leg { display: flex; flex-direction: column; align-items: center; min-width: 130px; }
.vline { width: 2px; height: 16px; background: #e67e22; }
.pnode { display: flex; flex-direction: column; align-items: center; padding: 4px 12px; border: 1px solid #eadfca; background: #fffaf0; border-radius: 6px; font-size: 14px; }
.pnode small { color: #999; font-size: 11px; }
.pnode.end { background: #fde3c4; border-color: #e67e22; font-weight: 600; }
.apex-node { background: #fff6dc; border: 2px solid #c9a45c; font-weight: 600; }
.linear { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.step { color: #e67e22; font-size: 12px; }
</style>
