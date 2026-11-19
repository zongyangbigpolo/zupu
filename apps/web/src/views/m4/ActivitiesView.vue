<template>
  <div class="page">
    <div class="row mb">
      <el-button text :icon="'ArrowLeft'" @click="router.push(`/clans/${clanId}`)">返回家族首页</el-button>
      <h2 class="title-serif grow" style="margin: 0">活动与公告</h2>
      <el-radio-group v-model="kind" @change="load(1)">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="activity">活动</el-radio-button>
        <el-radio-button value="announcement">公告</el-radio-button>
      </el-radio-group>
      <el-button v-if="isAdmin" type="danger" :icon="'Plus'" @click="openCreate">发布</el-button>
    </div>

    <div v-loading="loading">
      <el-empty v-if="!loading && !page.items.length" description="暂无活动或公告" />
      <el-card v-for="a in page.items" :key="a.id" shadow="hover" class="item" @click="router.push(`/activities/${a.id}`)">
        <div class="row">
          <el-tag v-if="a.pinned" type="danger" effect="dark" size="small">置顶</el-tag>
          <el-tag :type="a.kind === 'activity' ? 'warning' : 'info'" size="small">
            {{ a.kind === 'activity' ? ACTIVITY_CATEGORY_LABELS[a.category] : '公告' }}
          </el-tag>
          <b class="grow title">{{ a.title }}</b>
          <el-tag v-if="a.status === 'cancelled'" type="info">已取消</el-tag>
          <el-tag v-else-if="a.mySignup?.checkedInAt" type="success">已签到</el-tag>
          <el-tag v-else-if="a.mySignup?.status === 'signed'" type="success" effect="plain">已报名</el-tag>
        </div>
        <div class="muted meta">
          <template v-if="a.kind === 'activity'">
            <span>时间：{{ fmtTime(a.startAt) }}</span>
            <span v-if="a.location">地点：{{ a.location }}</span>
            <span v-if="a.allowSignup">已报名 {{ a.signupCount }} 户 / {{ a.headcountTotal }} 人<template v-if="a.maxParticipants">（限 {{ a.maxParticipants }} 人）</template></span>
          </template>
          <span>{{ a.createdByName || '管理员' }} 发布于 {{ fmtTime(a.createdAt) }}</span>
        </div>
        <div v-if="a.content" class="content">{{ a.content }}</div>
      </el-card>
      <el-pagination
        v-if="page.total > page.pageSize"
        layout="prev, pager, next"
        :total="page.total"
        :page-size="page.pageSize"
        :current-page="page.page"
        @current-change="load"
      />
    </div>

    <el-dialog v-model="dlg" title="发布活动 / 公告" width="560px">
      <el-form label-width="90px">
        <el-form-item label="类型">
          <el-radio-group v-model="form.kind">
            <el-radio-button value="activity">活动</el-radio-button>
            <el-radio-button value="announcement">公告</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.kind === 'activity'" label="活动类别">
          <el-select v-model="form.category">
            <el-option v-for="(l, v) in ACTIVITY_CATEGORY_LABELS" :key="v" :value="v" :label="l" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" required><el-input v-model="form.title" maxlength="120" /></el-form-item>
        <el-form-item label="内容"><el-input v-model="form.content" type="textarea" :rows="4" /></el-form-item>
        <template v-if="form.kind === 'activity'">
          <el-form-item label="地点"><el-input v-model="form.location" /></el-form-item>
          <el-form-item label="时间">
            <el-date-picker v-model="range" type="datetimerange" start-placeholder="开始" end-placeholder="结束" style="width: 100%" />
          </el-form-item>
          <el-form-item label="报名截止"><el-date-picker v-model="form.signupDeadline" type="datetime" /></el-form-item>
          <el-form-item label="开放报名"><el-switch v-model="form.allowSignup" /></el-form-item>
          <el-form-item label="人数上限"><el-input-number v-model="form.maxParticipants" :min="1" placeholder="不限" /></el-form-item>
        </template>
        <el-form-item label="置顶"><el-switch v-model="form.pinned" /></el-form-item>
      </el-form>
      <template #footer>
        <span class="muted" style="margin-right: 12px">发布后将通知全体族人（站内 + 微信订阅消息）</span>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="create">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ACTIVITY_CATEGORY_LABELS, type Activity, type ActivityInput, type ClanWithRole, type Paged } from '@zupu/shared';
import { api, run } from '../../api';
import { fmtTime, m4 } from '../../m4';

const route = useRoute();
const router = useRouter();
const clanId = route.params.clanId as string;
const clan = ref<ClanWithRole | null>(null);
const isAdmin = computed(() => clan.value?.myRole === 'admin' || clan.value?.myRole === 'super');
const kind = ref<'' | 'activity' | 'announcement'>('');
const page = ref<Paged<Activity>>({ items: [], total: 0, page: 1, pageSize: 20 });
const loading = ref(true);
const dlg = ref(false);
const saving = ref(false);
const range = ref<[Date, Date] | null>(null);
const blank = (): ActivityInput & { signupDeadline: any } => ({
  kind: 'activity',
  category: 'qingming',
  title: '',
  content: '',
  location: '',
  allowSignup: true,
  pinned: false,
  maxParticipants: null,
  signupDeadline: null,
});
const form = reactive(blank());

async function load(p = 1) {
  loading.value = true;
  const r = await run(m4.activities.list(clanId, { kind: kind.value || undefined, page: p }));
  if (r) page.value = r;
  loading.value = false;
}

function openCreate() {
  Object.assign(form, blank());
  range.value = null;
  dlg.value = true;
}

async function create() {
  if (!form.title.trim()) return ElMessage.warning('请填写标题');
  saving.value = true;
  const data: ActivityInput = {
    ...form,
    content: form.content || null,
    location: form.location || null,
    startAt: range.value?.[0]?.toISOString() ?? null,
    endAt: range.value?.[1]?.toISOString() ?? null,
    signupDeadline: form.signupDeadline ? new Date(form.signupDeadline).toISOString() : null,
    maxParticipants: form.maxParticipants || null,
  };
  const r = await run(m4.activities.create(clanId, data), '已发布并通知族人');
  saving.value = false;
  if (r) {
    dlg.value = false;
    load(1);
  }
}

onMounted(async () => {
  clan.value = (await run(api.clans.get(clanId))) ?? null;
  load(1);
});
</script>

<style scoped>
.mb { margin-bottom: 14px; }
.item { margin-bottom: 12px; cursor: pointer; }
.title { font-size: 16px; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 8px; }
.content { margin-top: 8px; white-space: pre-wrap; line-height: 1.7; color: #444; max-height: 5.1em; overflow: hidden; }
</style>
