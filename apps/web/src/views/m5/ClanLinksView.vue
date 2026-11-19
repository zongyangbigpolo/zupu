<template>
  <div class="page" v-if="clan">
    <el-page-header @back="router.push(`/clans/${clanId}`)" :title="clan.name">
      <template #content><span class="title-serif" style="font-size: 20px">跨族连谱</span></template>
      <template #extra>
        <el-button v-if="isAdmin" type="danger" :icon="'Plus'" @click="openPropose">发起连谱</el-button>
      </template>
    </el-page-header>
    <el-alert type="info" :closable="false" show-icon style="margin-top: 12px"
      title="同源不同支系的家族可以“连谱”：把本族谱中的某人（如共同始祖、分支祖）与对方谱中的同一人对应起来。一方管理员发起，对方管理员（或平台超级管理员）同意后生效；双方族人即可查看共同世系并跨族查询亲属关系。" />

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :md="9" :xs="24">
        <ClanLinkList :links="links" :active-id="active?.link.id" :empty-text="isAdmin ? '暂无连谱，可点击右上角发起' : '本族尚未与其他家族连谱'" @changed="load" @open="(l) => openLink(l.id)" />
      </el-col>
      <el-col :md="15" :xs="24">
        <template v-if="active">
          <el-card shadow="never" class="mb">
            <template #header>
              <span class="card-title">共同世系</span>
              <span class="muted">（两族对应人物“同一人”，向上为共同祖先链，向下为各自支系）</span>
            </template>
            <div class="lineage">
              <div v-for="(s, si) in active.sides" :key="s.clan.id" class="col">
                <div class="col-head title-serif" :class="{ mine: s.clan.id === clanId }">{{ s.clan.name }}</div>
                <div v-for="n in padTop(si)" :key="'pad' + n" class="slot" />
                <template v-for="a in [...s.ancestors].reverse()" :key="a.id">
                  <div class="pnode" :class="a.gender">{{ a.fullName }}<small v-if="a.generation">第{{ a.generation }}世</small></div>
                  <div class="vline" />
                </template>
                <div class="pnode anchor" :class="s.anchor.gender">
                  {{ s.anchor.fullName }}<small>{{ s.anchor.generation ? `第${s.anchor.generation}世 · ` : '' }}对应人物</small>
                </div>
                <div class="vline" v-if="s.children.length" />
                <div class="kids">
                  <span v-for="c in s.children" :key="c.id" class="kid" :class="c.gender">{{ c.fullName }}</span>
                </div>
                <div class="muted" style="margin-top: 6px">本支后代 {{ s.descendantCount }} 人</div>
              </div>
              <div class="same" :style="{ top: sameTop }">═ 同一人 ═</div>
            </div>
            <p class="muted" v-if="active.generationOffset">
              世代编号不同：{{ active.sides[1].clan.name }} 第 N 世 = {{ active.sides[0].clan.name }} 第 N{{ active.generationOffset > 0 ? '+' : '' }}{{ active.generationOffset }} 世。
            </p>
          </el-card>

          <el-card shadow="never">
            <template #header><span class="card-title">跨族亲属关系查询</span></template>
            <div class="pick">
              <div class="side">
                <div class="muted">甲</div>
                <el-radio-group v-model="fromClan" size="small" style="margin-bottom: 6px">
                  <el-radio-button v-for="s in active.sides" :key="s.clan.id" :value="s.clan.id">{{ s.clan.name }}</el-radio-button>
                </el-radio-group>
                <LinkedPersonPicker v-model="from" :link-id="active.link.id" :clan-id="fromClan" :initial="fromInit" placeholder="搜索甲方人物" />
              </div>
              <div class="side">
                <div class="muted">乙</div>
                <el-radio-group v-model="toClan" size="small" style="margin-bottom: 6px">
                  <el-radio-button v-for="s in active.sides" :key="s.clan.id" :value="s.clan.id">{{ s.clan.name }}</el-radio-button>
                </el-radio-group>
                <LinkedPersonPicker v-model="to" :link-id="active.link.id" :clan-id="toClan" placeholder="搜索乙方人物" />
              </div>
              <el-button type="danger" size="large" :disabled="!from || !to" :loading="busy" @click="compute">查询关系</el-button>
            </div>
            <p class="muted">对方家族只能搜索到连谱支系中的人物；在世者的出生信息按隐私设置隐藏。</p>

            <div v-if="kin" class="kin">
              <template v-if="kin.connected">
                <div class="big">
                  <span :class="kin.to.gender">{{ kin.to.fullName }}</span><el-tag size="small" class="ctag">{{ clanName(kin.personClan[kin.to.id] ?? toClan) }}</el-tag>
                  是 <span :class="kin.from.gender">{{ kin.from.fullName }}</span> 的 <b class="term">{{ kin.termAtoB ?? '亲属' }}</b>
                </div>
                <div class="big">
                  <span :class="kin.from.gender">{{ kin.from.fullName }}</span><el-tag size="small" class="ctag">{{ clanName(kin.personClan[kin.from.id] ?? fromClan) }}</el-tag>
                  是 <span :class="kin.to.gender">{{ kin.to.fullName }}</span> 的 <b class="term">{{ kin.termBtoA ?? '亲属' }}</b>
                </div>
                <el-descriptions :column="1" border size="small" style="margin-top: 12px">
                  <el-descriptions-item label="辈分">{{ kin.generationDiffText }}<span class="muted">（已按连谱对应人物对齐两族世代）</span></el-descriptions-item>
                  <el-descriptions-item v-if="kin.commonAncestor" label="共同祖先">
                    {{ kin.commonAncestor.fullName }}
                    <span class="muted">· 距{{ kin.from.fullName }} {{ kin.stepsUpFromA }} 代，距{{ kin.to.fullName }} {{ kin.stepsUpFromB }} 代</span>
                  </el-descriptions-item>
                  <el-descriptions-item label="关系链">{{ kin.from.fullName }}的{{ kin.chainText }}</el-descriptions-item>
                  <el-descriptions-item v-if="kin.note" label="说明">{{ kin.note }}</el-descriptions-item>
                </el-descriptions>
                <div class="path">
                  <template v-for="(p, i) in kin.path" :key="p.id">
                    <span class="node" :class="[p.gender, kin.personClan[p.id] === clanId ? 'own' : 'other', { end: i === 0 || i === kin.path.length - 1 }]">
                      {{ p.fullName }}
                    </span>
                    <span v-if="i < kin.steps.length" class="arrow">{{ STEP[kin.steps[i].kind] }}</span>
                  </template>
                </div>
                <div class="legend"><span class="node own">本族</span><span class="node other">对方家族</span></div>
              </template>
              <el-result v-else icon="warning" title="未找到关系路径" :sub-title="kin.generationDiffText" />
            </div>
          </el-card>
        </template>
        <el-empty v-else description="选择一条已生效的连谱查看共同世系" />
      </el-col>
    </el-row>

    <el-dialog v-model="proposeOpen" title="发起连谱" width="560px">
      <el-form label-width="110px">
        <el-form-item label="对方家族" required>
          <el-select v-model="target" filterable remote :remote-method="searchClans" :loading="searching" placeholder="输入族谱名称、姓氏、堂号或郡望" style="width: 100%">
            <el-option v-for="c in candidates" :key="c.id" :value="c.id" :label="c.name">
              <span>{{ c.name }}</span>
              <span class="muted" style="margin-left: 8px">{{ c.hallName || '' }} {{ c.origin ? '· ' + c.origin : '' }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="本族对应人物" required>
          <PersonPicker v-model="myPerson" :clan-id="clanId" :initial="founderInit" placeholder="如：共同始祖、分支祖" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="note" type="textarea" :rows="3" maxlength="500" placeholder="如：两支同出始迁祖文远公，康熙年间分居湘潭、衡阳" />
        </el-form-item>
      </el-form>
      <p class="muted">对方家族管理员会看到申请，并在其谱中选定同一人物后同意。</p>
      <template #footer>
        <el-button @click="proposeOpen = false">取消</el-button>
        <el-button type="danger" :disabled="!target || !myPerson" :loading="busy" @click="propose">提交申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ClanLinkInfo, ClanLinkLineage, ClanPublicBrief, ClanWithRole, CrossClanKinshipResult, PersonBrief } from '@zupu/shared';
import { api, run } from '../../api';
import { m5api } from '../../m5-api';
import PersonPicker from '../../components/PersonPicker.vue';
import ClanLinkList from '../../components/m5/ClanLinkList.vue';
import LinkedPersonPicker from '../../components/m5/LinkedPersonPicker.vue';

const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const clan = ref<ClanWithRole | null>(null);
const links = ref<ClanLinkInfo[]>([]);
const active = ref<ClanLinkLineage | null>(null);
const isAdmin = computed(() => clan.value?.myRole === 'admin' || clan.value?.myRole === 'super');
const STEP = { parent: '→父母→', child: '→子女→', spouse: '→配偶→' };

const proposeOpen = ref(false);
const target = ref<string | null>(null);
const candidates = ref<ClanPublicBrief[]>([]);
const searching = ref(false);
const myPerson = ref<string | null>(null);
const founderInit = ref<{ id: string; fullName: string } | null>(null);
const note = ref('');
const busy = ref(false);

const from = ref<string | null>(null);
const to = ref<string | null>(null);
const fromClan = ref('');
const toClan = ref('');
const fromInit = ref<PersonBrief | null>(null);
const kin = ref<CrossClanKinshipResult | null>(null);

const maxAnc = computed(() => Math.max(...(active.value?.sides.map((s) => s.ancestors.length) ?? [0])));
const padTop = (i: number) => maxAnc.value - (active.value?.sides[i].ancestors.length ?? 0);
// 列头 34px + 每个祖先 (节点 42 + 连线 16)；对齐到对应人物所在行
const sameTop = computed(() => `${34 + maxAnc.value * 58 + 12}px`);
const clanName = (id: string) => active.value?.sides.find((s) => s.clan.id === id)?.clan.name ?? '';

async function load() {
  links.value = (await run(m5api.clanLinks.list(clanId))) ?? [];
  const want = (route.query.link as string) || links.value.find((l) => l.status === 'approved')?.id;
  if (want && links.value.some((l) => l.id === want && l.status === 'approved')) await openLink(want);
  else active.value = null;
}

async function openLink(id: string) {
  router.replace({ query: { link: id } });
  active.value = (await run(m5api.clanLinks.lineage(id))) ?? null;
  kin.value = null;
  if (!active.value) return;
  const own = active.value.sides.find((s) => s.clan.id === clanId) ?? active.value.sides[0];
  const other = active.value.sides.find((s) => s !== own)!;
  fromClan.value = own.clan.id;
  toClan.value = other.clan.id;
  to.value = null;
  from.value = null;
  if (clan.value?.myLinkedPersonId) {
    const p = await run(api.persons.get(clan.value.myLinkedPersonId));
    if (p) {
      fromInit.value = p;
      from.value = p.id;
    }
  }
}

watch(fromClan, (v, old) => old && v !== old && (from.value = null));
watch(toClan, (v, old) => old && v !== old && (to.value = null));

async function compute() {
  busy.value = true;
  kin.value = (await run(m5api.clanLinks.kinship(active.value!.link.id, from.value!, to.value!))) ?? null;
  busy.value = false;
}

async function openPropose() {
  target.value = null;
  note.value = '';
  myPerson.value = clan.value?.founderId ?? null;
  if (clan.value?.founderId && !founderInit.value) {
    const f = await run(api.persons.get(clan.value.founderId));
    if (f) founderInit.value = { id: f.id, fullName: f.fullName };
  }
  proposeOpen.value = true;
}
async function searchClans(q: string) {
  if (!q.trim()) return;
  searching.value = true;
  candidates.value = (await run(m5api.clanLinks.searchClans(clanId, q))) ?? [];
  searching.value = false;
}
async function propose() {
  busy.value = true;
  const r = await run(m5api.clanLinks.propose(clanId, { targetClanId: target.value!, personId: myPerson.value!, note: note.value || null }), '已提交，等待对方家族管理员同意');
  busy.value = false;
  if (r) {
    proposeOpen.value = false;
    await load();
  }
}

onMounted(async () => {
  clan.value = (await run(api.clans.get(clanId))) ?? null;
  if (clan.value) await load();
});
</script>

<style scoped>
.mb { margin-bottom: 16px; }
.lineage { position: relative; display: flex; gap: 80px; justify-content: center; padding: 4px 0 8px; }
.col { display: flex; flex-direction: column; align-items: center; min-width: 170px; }
.col-head { height: 26px; margin-bottom: 8px; font-size: 16px; color: #555; }
.col-head.mine { color: var(--zp-red); font-weight: 600; }
.slot { height: 58px; }
.pnode { height: 42px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 14px; border: 1px solid #eadfca; background: #fffaf0; border-radius: 6px; font-size: 14px; }
.pnode small { color: #999; font-size: 11px; }
.pnode.anchor { background: #fde3c4; border: 2px solid #e67e22; font-weight: 600; }
.vline { width: 2px; height: 16px; background: #c9a45c; }
.kids { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; max-width: 220px; }
.kid { padding: 2px 8px; border-radius: 4px; background: #f4efe4; font-size: 13px; }
.same { position: absolute; left: 50%; transform: translateX(-50%); color: #e67e22; font-weight: 600; font-size: 13px; white-space: nowrap; }
.pick { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.side { flex: 1; min-width: 220px; }
.kin { margin-top: 16px; border-top: 1px dashed #eadfca; padding-top: 12px; }
.big { font-size: 16px; margin: 6px 0; }
.ctag { margin: 0 6px 0 4px; }
.term { font-size: 22px; color: var(--zp-red); font-family: 'Songti SC', 'STSong', serif; margin-left: 4px; }
.path { margin-top: 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.node { padding: 2px 8px; border-radius: 4px; font-size: 13px; }
.node.own { background: #fdecec; }
.node.other { background: #e8f1fd; }
.node.end { font-weight: 700; outline: 1px solid #e67e22; }
.arrow { color: #aaa; font-size: 11px; }
.legend { margin-top: 8px; display: flex; gap: 8px; }
</style>
