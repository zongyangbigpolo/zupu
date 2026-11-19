<template>
  <div class="vpage">
    <VisualHeader :clan-id="clanId" :clan-name="clan?.name" title="祠堂 · 祖坟 · 祖屋" current="sites" />
    <div class="toolbar">
      <el-checkbox-group v-model="types">
        <el-checkbox-button v-for="(l, k) in SITE_TYPE_LABELS" :key="k" :value="k">
          <span class="dot" :style="{ background: SITE_TYPE_COLORS[k] }" />{{ l }}
        </el-checkbox-button>
      </el-checkbox-group>
      <div class="grow" />
      <el-button v-if="isAdmin" type="danger" :icon="'Plus'" @click="openEdit()">新增地点</el-button>
    </div>
    <div class="body">
      <div class="map" v-loading="loading">
        <MapCanvas ref="mapRef" :markers="markers" :fit-key="fitKey" @marker-click="select" />
      </div>
      <div class="side">
        <el-empty v-if="!shown.length && !loading" description="暂无地点" :image-size="60" />
        <el-card v-for="s in shown" :key="s.id" shadow="never" class="site" :class="{ active: activeId === s.id }" :id="`site-${s.id}`" @click="select(s.id)">
          <div class="row" style="gap: 8px">
            <el-tag :color="SITE_TYPE_COLORS[s.type]" effect="dark" size="small" style="border: none">{{ SITE_TYPE_LABELS[s.type] }}</el-tag>
            <span class="title-serif name">{{ s.name }}</span>
          </div>
          <div class="muted" v-if="s.address"><el-icon><Location /></el-icon> {{ s.address }}</div>
          <div class="muted" v-if="s.builtText">{{ s.builtText }}</div>
          <div v-if="s.intro" class="rich intro" v-html="sanitizeHtml(s.intro)" />
          <div v-if="s.persons.length" class="persons">
            <span class="muted">关联人物：</span>
            <router-link v-for="p in s.persons" :key="p.id" :to="`/persons/${p.id}`" class="plink" @click.stop>
              {{ p.fullName }}<small v-if="p.generation" class="muted">（{{ p.generation }}世）</small>
            </router-link>
          </div>
          <div v-if="s.photos.length" class="photos">
            <div v-for="(ph, i) in s.photos" :key="ph.id" class="ph">
              <el-image :src="ph.url" fit="cover" :preview-src-list="s.photos.map((x) => x.url)" :initial-index="i" preview-teleported @click.stop />
              <el-button v-if="isAdmin" class="del" circle size="small" type="danger" :icon="'Close'" @click.stop="removePhoto(ph.id)" />
            </div>
          </div>
          <div class="row actions">
            <template v-if="s.lng != null && s.lat != null">
              <el-button size="small" type="primary" plain :icon="'Position'" tag="a" :href="nav(s).amap" target="_blank" rel="noopener" @click.stop>高德导航</el-button>
              <el-button size="small" plain tag="a" :href="nav(s).tencent" target="_blank" rel="noopener" @click.stop>腾讯地图</el-button>
            </template>
            <span v-else class="muted">未设置坐标</span>
            <div class="grow" />
            <template v-if="isAdmin">
              <el-upload :show-file-list="false" accept="image/*" :http-request="(o: any) => upload(s.id, o.file)" @click.stop>
                <el-button size="small" link :icon="'Picture'">传照片</el-button>
              </el-upload>
              <el-button size="small" link @click.stop="openEdit(s)">编辑</el-button>
              <el-popconfirm title="删除该地点及其照片？" @confirm="remove(s)">
                <template #reference><el-button size="small" link type="danger" @click.stop>删除</el-button></template>
              </el-popconfirm>
            </template>
          </div>
        </el-card>
      </div>
    </div>

    <el-dialog v-model="editing" :title="form.id ? '编辑地点' : '新增地点'" width="760px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="类型" required>
          <el-radio-group v-model="form.type">
            <el-radio-button v-for="(l, k) in SITE_TYPE_LABELS" :key="k" :value="k">{{ l }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="名称" required><el-input v-model="form.name" maxlength="100" placeholder="如 陇西堂李氏宗祠" /></el-form-item>
        <el-form-item label="地址与坐标">
          <PlaceInput v-model:name="form.address" v-model:lng="form.lng" v-model:lat="form.lat" placeholder="详细地址" />
        </el-form-item>
        <el-form-item label="年代"><el-input v-model="form.builtText" maxlength="100" placeholder="如 乾隆五十五年始建" /></el-form-item>
        <el-form-item label="关联人物">
          <el-select v-model="form.personIds" multiple filterable remote :remote-method="searchPersons" :loading="searching" placeholder="输入姓名搜索" style="width: 100%">
            <el-option v-for="o in personOptions" :key="o.id" :value="o.id" :label="o.fullName">
              <span>{{ o.fullName }}</span> <span class="muted">{{ o.disambiguation }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="简介"><RichEditor v-model="form.intro" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editing = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { navigationLinks, SITE_TYPE_COLORS, SITE_TYPE_LABELS, type Site, type SiteType } from '@zupu/shared';
import RichEditor from '../components/RichEditor.vue';
import { api, errorMessage, run } from '../api';
import { sanitizeHtml } from '../sanitize';
import { getMapConfig, uploadSitePhoto, visualApi } from './api';
import MapCanvas from './MapCanvas.vue';
import PlaceInput from './PlaceInput.vue';
import VisualHeader from './VisualHeader.vue';
import { useClan } from './useClan';
import type { MapMarker } from './map-types';

const route = useRoute();
const clanId = route.params.clanId as string;
const { clan, isAdmin, load: loadClan } = useClan(clanId);
const list = ref<Site[]>([]);
const loading = ref(false);
const types = ref<SiteType[]>(['ancestral_hall', 'tomb', 'ancestral_house', 'other']);
const activeId = ref<string | null>(null);
const fitKey = ref(0);
const mapRef = ref<InstanceType<typeof MapCanvas>>();
const tencentKey = ref<string | null>(null);

const shown = computed(() => list.value.filter((s) => types.value.includes(s.type)));
const markers = computed<MapMarker[]>(() =>
  shown.value
    .filter((s) => s.lng != null && s.lat != null)
    .map((s) => ({ id: s.id, name: s.name, lng: s.lng!, lat: s.lat!, color: SITE_TYPE_COLORS[s.type], size: activeId.value === s.id ? 16 : 11 }))
    .sort((a, b) => (a.id === activeId.value ? -1 : b.id === activeId.value ? 1 : 0)),
);
const nav = (s: Site) => navigationLinks(s.name, s.lng!, s.lat!, tencentKey.value);

async function select(id: string) {
  activeId.value = id;
  const s = list.value.find((x) => x.id === id);
  if (s?.lng != null && s.lat != null) mapRef.value?.focus(s.lng, s.lat, 11);
  await nextTick();
  document.getElementById(`site-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function load(fit = true) {
  loading.value = true;
  list.value = (await run(visualApi.sites.list(clanId))) ?? [];
  loading.value = false;
  if (fit) fitKey.value++;
}

// ---------- 录入 ----------
const editing = ref(false);
const saving = ref(false);
const empty = () => ({
  id: '',
  type: 'ancestral_hall' as SiteType,
  name: '',
  address: '',
  lng: null as number | null,
  lat: null as number | null,
  builtText: '',
  intro: '',
  personIds: [] as string[],
});
const form = reactive(empty());
const personOptions = ref<{ id: string; fullName: string; disambiguation?: string }[]>([]);
const searching = ref(false);
async function searchPersons(q: string) {
  if (!q.trim()) return;
  searching.value = true;
  try {
    const r = await api.clans.searchPersons(clanId, { q, pageSize: 30 });
    const keep = personOptions.value.filter((o) => form.personIds.includes(o.id));
    personOptions.value = [...keep, ...r.items.filter((i) => !keep.some((k) => k.id === i.id))];
  } finally {
    searching.value = false;
  }
}
function openEdit(s?: Site) {
  Object.assign(form, empty());
  personOptions.value = [];
  if (s) {
    Object.assign(form, {
      id: s.id,
      type: s.type,
      name: s.name,
      address: s.address ?? '',
      lng: s.lng,
      lat: s.lat,
      builtText: s.builtText ?? '',
      intro: s.intro ?? '',
      personIds: s.persons.map((p) => p.id),
    });
    personOptions.value = s.persons.map((p) => ({ id: p.id, fullName: p.fullName }));
  }
  editing.value = true;
}
async function save() {
  if (!form.name.trim()) return ElMessage.warning('请填写名称');
  const data = {
    type: form.type,
    name: form.name.trim(),
    address: form.address || null,
    lng: form.lng,
    lat: form.lat,
    builtText: form.builtText || null,
    intro: form.intro || null,
    personIds: form.personIds,
  };
  saving.value = true;
  const r = await run(form.id ? visualApi.sites.update(form.id, data) : visualApi.sites.create(clanId, data), '已保存');
  saving.value = false;
  if (r) {
    editing.value = false;
    await load(!form.id);
    select(r.id);
  }
}
async function remove(s: Site) {
  if ((await run(visualApi.sites.remove(s.id), '已删除')) !== undefined) load();
}
async function upload(siteId: string, file: File) {
  try {
    await uploadSitePhoto(siteId, file);
    ElMessage.success('照片已上传');
    load(false);
  } catch (e) {
    ElMessage.error(errorMessage(e));
  }
}
async function removePhoto(id: string) {
  if ((await run(visualApi.sites.removePhoto(id), '已删除')) !== undefined) load(false);
}

onMounted(async () => {
  getMapConfig().then((c) => (tencentKey.value = c.provider === 'tencent' ? c.key : null));
  await loadClan();
  if (clan.value) load();
});
</script>

<style scoped>
.vpage { display: flex; flex-direction: column; height: calc(100vh - 54px); }
.toolbar { display: flex; align-items: center; gap: 10px; padding: 8px 16px; background: #fffaf0; border-bottom: 1px solid #eee2cc; }
.body { flex: 1; display: flex; min-height: 0; }
.map { flex: 1; position: relative; }
.side { width: 420px; overflow: auto; padding: 12px; background: #faf6ee; border-left: 1px solid #eee2cc; }
.site { margin-bottom: 10px; cursor: pointer; border-left: 3px solid transparent; }
.site.active { border-left-color: var(--zp-red); background: #fffaf0; }
.name { font-size: 17px; }
.intro { font-size: 13px; color: #555; margin-top: 6px; }
.persons { margin-top: 6px; font-size: 13px; }
.plink { color: #2f6fd6; margin-right: 8px; }
.photos { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.ph { position: relative; width: 84px; height: 64px; }
.ph .el-image { width: 100%; height: 100%; border-radius: 3px; }
.ph .del { position: absolute; top: -6px; right: -6px; transform: scale(0.7); }
.actions { margin-top: 8px; gap: 4px; flex-wrap: nowrap; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; }
</style>
