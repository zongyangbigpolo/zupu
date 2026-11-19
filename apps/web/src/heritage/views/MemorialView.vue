<template>
  <div class="memorial" v-if="m">
    <div class="hero">
      <div class="hero-inner">
        <div class="portrait">
          <img v-if="portrait" :src="portrait.url" />
          <div v-else class="ph title-serif">{{ m.person.givenName.slice(-1) }}</div>
        </div>
        <div class="info">
          <div class="label title-serif">{{ clan?.name }}</div>
          <h1 class="title-serif">{{ m.person.fullName }}<small>　纪念馆</small></h1>
          <div class="sub">
            <span v-if="m.person.courtesyName">字{{ m.person.courtesyName }}</span>
            <span v-if="m.person.artName">号{{ m.person.artName }}</span>
            <span v-if="m.person.generation">第{{ m.person.generation }}世{{ m.person.generationChar ? `「${m.person.generationChar}」字辈` : '' }}</span>
          </div>
          <div class="sub">
            {{ m.person.birthText || m.person.birthDate || '生年不详' }} — {{ m.person.deathText || m.person.deathDate || '卒年不详' }}
            <span v-if="m.ageAtDeath" class="age">享年 {{ m.ageAtDeath }} 岁</span>
          </div>
          <div v-if="m.person.burialPlace" class="sub">葬于：{{ m.person.burialPlace }}</div>
        </div>
        <div class="altar">
          <div class="offer">
            <div class="icons">
              <span v-for="i in Math.min(m.tributes.flower, 9)" :key="'f' + i" class="flower">💐</span>
            </div>
            <el-button round class="obtn" :disabled="!m.canInteract || m.tributes.myFlowerToday" @click="tribute('flower')">
              {{ m.tributes.myFlowerToday ? '今日已献花' : '献花' }} · {{ m.tributes.flower }}
            </el-button>
          </div>
          <div class="offer">
            <div class="icons">
              <span v-for="i in Math.min(m.tributes.candle, 9)" :key="'c' + i" class="candle">🕯️</span>
            </div>
            <el-button round class="obtn" :disabled="!m.canInteract || m.tributes.myCandleToday" @click="tribute('candle')">
              {{ m.tributes.myCandleToday ? '今日已点烛' : '点烛' }} · {{ m.tributes.candle }}
            </el-button>
          </div>
          <div v-if="!m.canInteract" class="hint">本族族人登录后可献花、点烛与留言</div>
        </div>
      </div>
      <transition-group name="fall" tag="div" class="falling">
        <span v-for="f in falling" :key="f.id" class="drop" :style="{ left: f.x + '%' }">{{ f.icon }}</span>
      </transition-group>
    </div>

    <div class="page body">
      <div class="row" style="margin-bottom: 12px">
        <el-button :icon="'Back'" @click="router.push(`/persons/${m.person.id}`)">人物档案</el-button>
        <el-button :icon="'Share'" @click="router.push(`/persons/${m.person.id}/tree`)">五代树</el-button>
      </div>
      <el-row :gutter="16">
        <el-col :md="15" :xs="24">
          <el-card shadow="never" class="mb">
            <template #header><span class="card-title">生平</span></template>
            <div v-if="m.person.biography" class="rich bio" v-html="sanitizeHtml(m.person.biography)" />
            <p v-else class="muted">暂无生平记载</p>
            <el-timeline v-if="m.events.length" style="margin-top: 16px">
              <el-timeline-item v-for="e in m.events" :key="e.id" :timestamp="[e.eventText || e.eventDate, e.place].filter(Boolean).join(' · ')" placement="top">
                <el-tag v-if="e.type" size="small" effect="plain" style="margin-right: 6px">{{ e.type }}</el-tag><b>{{ e.title }}</b>
                <div v-if="e.description" class="muted">{{ e.description }}</div>
              </el-timeline-item>
            </el-timeline>
          </el-card>

          <el-card v-if="m.photos.length" shadow="never" class="mb">
            <template #header><span class="card-title">遗像与旧照</span></template>
            <div class="photos">
              <el-image
                v-for="(p, i) in m.photos"
                :key="p.id"
                :src="p.thumbnailUrl || p.url"
                :preview-src-list="m.photos.map((x) => x.url)"
                :initial-index="i"
                fit="cover"
                class="ph-item"
                :title="p.caption ?? ''"
              />
            </div>
          </el-card>

          <el-card v-if="m.oralHistories.length || m.audios.length || m.videos.length" shadow="never" class="mb">
            <template #header><span class="card-title">声音与影像</span></template>
            <div v-for="o in m.oralHistories" :key="o.id" class="av">
              <b class="title-serif">{{ o.title }}</b>
              <span class="muted"> {{ [o.narrator && `讲述：${o.narrator}`, o.recordedText].filter(Boolean).join(' · ') }}</span>
              <audio v-if="o.audio" :src="o.audio.url" controls preload="none" />
              <div v-if="o.transcript" class="transcript">{{ o.transcript }}</div>
            </div>
            <div v-for="a in m.audios" :key="a.id" class="av">
              <b>{{ a.caption }}</b>
              <audio :src="a.url" controls preload="none" />
            </div>
            <div v-for="v in m.videos" :key="v.id" class="av">
              <b>{{ v.caption }}</b>
              <video :src="v.url" :poster="v.thumbnailUrl ?? undefined" controls preload="none" style="width: 100%; max-height: 320px" />
            </div>
          </el-card>
        </el-col>

        <el-col :md="9" :xs="24">
          <el-card shadow="never" class="mb msgs">
            <template #header><span class="card-title">追思留言</span><span class="muted" v-if="msgs.total"> · {{ msgs.total }} 条</span></template>
            <template v-if="m.messagesVisible">
              <div v-if="m.canInteract" class="compose">
                <el-input v-model="text" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="写下您的追思……" />
                <el-button type="danger" size="small" :disabled="!text.trim()" :loading="posting" style="margin-top: 6px" @click="post">留言</el-button>
              </div>
              <div v-for="x in msgs.items" :key="x.id" class="msg">
                <div class="row">
                  <b>{{ x.authorName }}</b>
                  <span class="muted">{{ new Date(x.createdAt).toLocaleString('zh-CN') }}</span>
                  <div class="grow" />
                  <el-popconfirm v-if="x.canDelete" title="确定删除该留言？" @confirm="removeMsg(x.id)">
                    <template #reference><el-button link size="small" type="danger">删除</el-button></template>
                  </el-popconfirm>
                </div>
                <div class="content">{{ x.content }}</div>
              </div>
              <el-empty v-if="!msgs.items.length" :image-size="50" description="还没有留言" />
              <el-pagination v-if="msgs.total > msgs.pageSize" small layout="prev, pager, next" :total="msgs.total" :page-size="msgs.pageSize" :current-page="msgs.page" @current-change="loadMsgs" />
            </template>
            <el-empty v-else :image-size="50" description="留言仅本族族人登录后可见" />
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
  <el-result v-else-if="err" icon="info" :title="err" style="margin-top: 60px">
    <template #extra><el-button @click="router.back()">返回</el-button></template>
  </el-result>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { ClanWithRole, MemorialInfo, MemorialMessage, Paged, TributeKind } from '@zupu/shared';
import { api, errorMessage, run } from '../../api';
import { sanitizeHtml } from '../../sanitize';
import { heritage } from '../api';

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;
const m = ref<MemorialInfo | null>(null);
const clan = ref<ClanWithRole | null>(null);
const err = ref('');
const msgs = ref<Paged<MemorialMessage>>({ items: [], total: 0, page: 1, pageSize: 20 });
const text = ref('');
const posting = ref(false);
const falling = ref<{ id: number; x: number; icon: string }[]>([]);
const portrait = computed(() => m.value?.photos.find((p) => p.id === m.value?.person.avatarMediaId) ?? m.value?.photos[0]);

async function loadMsgs(page = 1) {
  if (!m.value?.messagesVisible) return;
  msgs.value = (await run(heritage.memorial.messages(id, { page, pageSize: 20 }))) ?? msgs.value;
}
onMounted(async () => {
  try {
    m.value = await heritage.memorial.get(id);
  } catch (e) {
    err.value = errorMessage(e);
    return;
  }
  document.title = `${m.value.person.fullName} 纪念馆 · 族谱`;
  clan.value = (await run(api.clans.get(m.value.person.clanId))) ?? null;
  loadMsgs();
});

async function tribute(kind: TributeKind) {
  const r = await run(heritage.memorial.tribute(id, kind));
  if (!r || !m.value) return;
  m.value.tributes = r;
  if (r.already) return ElMessage.info('今日已表心意');
  ElMessage.success(kind === 'flower' ? '已献花，寄托哀思' : '已点烛，长明不熄');
  const icon = kind === 'flower' ? '🌸' : '✨';
  for (let i = 0; i < 12; i++) {
    const f = { id: Date.now() + i, x: 5 + Math.random() * 90, icon };
    setTimeout(() => falling.value.push(f), i * 80);
    setTimeout(() => (falling.value = falling.value.filter((x) => x.id !== f.id)), 1800 + i * 80);
  }
}
async function post() {
  posting.value = true;
  const r = await run(heritage.memorial.postMessage(id, text.value.trim()), '留言已发布');
  posting.value = false;
  if (r) {
    text.value = '';
    loadMsgs(1);
  }
}
async function removeMsg(mid: string) {
  await run(heritage.memorial.removeMessage(mid), '已删除');
  loadMsgs(msgs.value.page);
}
</script>

<style scoped>
.hero { position: relative; overflow: hidden; background: radial-gradient(ellipse at top, #3a2a1c 0%, #1b1410 70%); color: #efe3c8; padding: 36px 20px; }
.hero::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 60px, rgba(201, 164, 92, 0.04) 60px 61px); pointer-events: none; }
.hero-inner { max-width: 1160px; margin: 0 auto; display: flex; gap: 32px; align-items: center; flex-wrap: wrap; position: relative; z-index: 1; }
.portrait { width: 150px; height: 190px; border: 6px solid #2a1f16; outline: 2px solid #c9a45c; box-shadow: 0 0 30px rgba(0, 0, 0, 0.6); background: #2a1f16; }
.portrait img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(0.6) sepia(0.25); }
.portrait .ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 72px; color: #c9a45c; }
.info { flex: 1; min-width: 260px; }
.label { color: #c9a45c; letter-spacing: 4px; }
h1 { margin: 6px 0 10px; font-size: 40px; letter-spacing: 8px; color: #f6e7c1; }
h1 small { font-size: 18px; letter-spacing: 4px; color: #c9a45c; }
.sub { margin: 4px 0; color: #d6c7a8; display: flex; gap: 12px; flex-wrap: wrap; }
.age { color: #f6d99b; }
.altar { display: flex; gap: 18px; flex-wrap: wrap; align-items: flex-end; }
.offer { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.icons { height: 64px; width: 150px; display: flex; flex-wrap: wrap-reverse; justify-content: center; align-content: flex-start; font-size: 22px; }
.candle { animation: flicker 2s infinite alternate; }
@keyframes flicker { from { filter: drop-shadow(0 0 2px #ffb400); } to { filter: drop-shadow(0 0 8px #ffdd55); } }
.obtn { background: transparent; color: #f6d99b; border-color: #c9a45c; }
.obtn:hover { background: #c9a45c; color: #1b1410; }
.hint { width: 100%; text-align: center; font-size: 12px; color: #a99677; }
.falling { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
.drop { position: absolute; top: -20px; font-size: 24px; animation: fall 1.8s ease-in forwards; }
@keyframes fall { to { transform: translateY(320px) rotate(200deg); opacity: 0; } }
.body { padding-top: 16px; }
.mb { margin-bottom: 16px; }
.bio { font-family: 'Songti SC', 'STSong', serif; font-size: 16px; }
.photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
.ph-item { aspect-ratio: 1; border-radius: 4px; }
.av { padding: 8px 0; border-bottom: 1px dashed #eadfca; }
.av audio { width: 100%; margin-top: 6px; }
.transcript { white-space: pre-wrap; color: #555; font-family: 'Songti SC', serif; line-height: 1.9; margin-top: 6px; max-height: 200px; overflow: auto; }
.msgs { background: #fffdf8; }
.compose { margin-bottom: 12px; text-align: right; }
.msg { padding: 10px 0; border-bottom: 1px solid #f2ead8; }
.msg .content { margin-top: 4px; line-height: 1.8; white-space: pre-wrap; }
</style>
