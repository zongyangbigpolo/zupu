<template>
  <div class="page" v-if="a">
    <div class="row mb">
      <el-button text :icon="'ArrowLeft'" @click="router.push(`/clans/${a.clanId}/activities`)">返回活动列表</el-button>
    </div>
    <el-card shadow="never" class="mb">
      <div class="row">
        <el-tag :type="a.kind === 'activity' ? 'warning' : 'info'">{{ a.kind === 'activity' ? ACTIVITY_CATEGORY_LABELS[a.category] : '公告' }}</el-tag>
        <h2 class="title-serif grow" style="margin: 0">{{ a.title }}</h2>
        <el-tag v-if="a.status === 'cancelled'" type="info" size="large">已取消</el-tag>
      </div>
      <el-descriptions v-if="a.kind === 'activity'" :column="2" border class="desc">
        <el-descriptions-item label="开始">{{ fmtTime(a.startAt) }}</el-descriptions-item>
        <el-descriptions-item label="结束">{{ fmtTime(a.endAt) }}</el-descriptions-item>
        <el-descriptions-item label="地点">{{ a.location || '—' }}</el-descriptions-item>
        <el-descriptions-item label="报名截止">{{ fmtTime(a.signupDeadline) }}</el-descriptions-item>
        <el-descriptions-item label="报名">
          {{ a.signupCount }} 户 / {{ a.headcountTotal }} 人<template v-if="a.maxParticipants">（限 {{ a.maxParticipants }} 人）</template>
        </el-descriptions-item>
        <el-descriptions-item label="已签到">{{ a.checkedInCount }} 户</el-descriptions-item>
      </el-descriptions>
      <div v-if="a.content" class="content">{{ a.content }}</div>
      <div class="muted" style="margin-top: 10px">{{ a.createdByName || '管理员' }} 发布于 {{ fmtTime(a.createdAt) }}</div>

      <div v-if="a.kind === 'activity' && a.status === 'published'" class="row actions">
        <template v-if="a.allowSignup">
          <template v-if="a.mySignup?.status === 'signed'">
            <el-tag type="success" size="large">已报名 {{ a.mySignup.headcount }} 人</el-tag>
            <el-tag v-if="a.mySignup.checkedInAt" type="success" effect="dark" size="large">已签到 {{ fmtTime(a.mySignup.checkedInAt) }}</el-tag>
            <el-button v-else @click="cancel">取消报名</el-button>
          </template>
          <template v-else>
            <span>同行人数（含本人）</span>
            <el-input-number v-model="headcount" :min="1" :max="50" />
            <el-input v-model="note" placeholder="备注（可选）" style="width: 200px" />
            <el-button type="danger" @click="signup">报名</el-button>
          </template>
        </template>
        <template v-if="!a.mySignup?.checkedInAt">
          <el-input v-model="code" placeholder="现场签到码" style="width: 140px" maxlength="10" />
          <el-button type="warning" @click="checkin">签到</el-button>
        </template>
      </div>
    </el-card>

    <el-card v-if="a.kind === 'activity'" shadow="never">
      <template #header>
        <div class="row">
          <span class="card-title grow">报名名单</span>
          <template v-if="isAdmin">
            <span class="muted">现场签到码：</span><b class="code">{{ a.checkinCode }}</b>
            <el-button v-if="a.status === 'published'" size="small" @click="setStatus('cancelled')">取消活动</el-button>
            <el-button v-else size="small" @click="setStatus('published')">恢复活动</el-button>
            <el-popconfirm title="确定删除？报名记录也会删除" @confirm="remove">
              <template #reference><el-button size="small" type="danger" plain>删除</el-button></template>
            </el-popconfirm>
          </template>
        </div>
      </template>
      <el-table :data="a.signups" size="small" stripe empty-text="暂无报名">
        <el-table-column label="族人" min-width="120">
          <template #default="{ row }">{{ row.displayName || '—' }}<span v-if="row.linkedPersonName" class="muted">（{{ row.linkedPersonName }}）</span></template>
        </el-table-column>
        <el-table-column label="人数" prop="headcount" width="70" />
        <el-table-column label="备注" min-width="140"><template #default="{ row }">{{ row.note || '' }}</template></el-table-column>
        <el-table-column label="报名时间" width="150"><template #default="{ row }">{{ fmtTime(row.createdAt) }}</template></el-table-column>
        <el-table-column label="签到" width="160">
          <template #default="{ row }">
            <el-tag v-if="row.checkedInAt" type="success" size="small">{{ fmtTime(row.checkedInAt) }}</el-tag>
            <el-button v-else-if="isAdmin" link type="danger" @click="adminCheckin(row.userId)">代签到</el-button>
            <span v-else class="muted">未签到</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ACTIVITY_CATEGORY_LABELS, type ActivityDetail } from '@zupu/shared';
import { run } from '../../api';
import { fmtTime, m4 } from '../../m4';

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;
const a = ref<ActivityDetail | null>(null);
const headcount = ref(1);
const note = ref('');
const code = ref('');
const isAdmin = computed(() => a.value?.checkinCode !== undefined);

async function load() {
  a.value = (await run(m4.activities.get(id))) ?? null;
}
async function signup() {
  if (await run(m4.activities.signup(id, { headcount: headcount.value, note: note.value || null }), '报名成功')) load();
}
async function cancel() {
  if ((await run(m4.activities.cancelSignup(id), '已取消报名')) !== undefined) load();
}
async function checkin() {
  if (await run(m4.activities.checkin(id, code.value), '签到成功')) load();
}
async function adminCheckin(userId: string) {
  if (await run(m4.activities.adminCheckin(id, userId), '已签到')) load();
}
async function setStatus(status: 'published' | 'cancelled') {
  if (await run(m4.activities.update(id, { status }), '已更新')) load();
}
async function remove() {
  const clanId = a.value!.clanId;
  if ((await run(m4.activities.remove(id), '已删除')) !== undefined) router.push(`/clans/${clanId}/activities`);
}
onMounted(load);
</script>

<style scoped>
.mb { margin-bottom: 14px; }
.desc { margin-top: 14px; }
.content { margin-top: 14px; white-space: pre-wrap; line-height: 1.8; }
.actions { margin-top: 16px; padding-top: 14px; border-top: 1px dashed #eadfca; }
.code { font-size: 18px; letter-spacing: 3px; color: var(--zp-red); margin-right: 10px; }
</style>
