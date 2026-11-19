<template>
  <view v-if="a">
    <view class="card">
      <view class="row" style="gap: 10rpx">
        <text class="tag">{{ a.kind === 'activity' ? ACTIVITY_CATEGORY_LABELS[a.category] : '公告' }}</text>
        <text v-if="a.status === 'cancelled'" class="tag gray">已取消</text>
      </view>
      <view class="title serif">{{ a.title }}</view>
      <template v-if="a.kind === 'activity'">
        <view class="kv"><text class="k">时间</text><text>{{ fmtTime(a.startAt) }}{{ a.endAt ? ` 至 ${fmtTime(a.endAt)}` : '' }}</text></view>
        <view v-if="a.location" class="kv"><text class="k">地点</text><text>{{ a.location }}</text></view>
        <view v-if="a.signupDeadline" class="kv"><text class="k">报名截止</text><text>{{ fmtTime(a.signupDeadline) }}</text></view>
        <view v-if="a.allowSignup" class="kv">
          <text class="k">报名</text>
          <text>{{ a.signupCount }} 户 / {{ a.headcountTotal }} 人{{ a.maxParticipants ? `（限 ${a.maxParticipants} 人）` : '' }} · 已签到 {{ a.checkedInCount }} 户</text>
        </view>
      </template>
      <view v-if="a.content" class="content">{{ a.content }}</view>
      <view class="muted" style="margin-top: 16rpx">{{ a.createdByName || '管理员' }} 发布于 {{ fmtTime(a.createdAt) }}</view>
    </view>

    <view v-if="a.kind === 'activity' && a.status === 'published'" class="card">
      <template v-if="a.allowSignup">
        <view v-if="a.mySignup?.status === 'signed'" class="row">
          <text class="tag green">已报名 {{ a.mySignup.headcount }} 人</text>
          <text v-if="a.mySignup.checkedInAt" class="tag green">已签到</text>
          <view class="grow" />
          <button v-if="!a.mySignup.checkedInAt" class="btn-plain" size="mini" @click="cancel">取消报名</button>
        </view>
        <view v-else>
          <view class="row">
            <text class="grow">同行人数（含本人）</text>
            <view class="stepper">
              <text @click="headcount > 1 && headcount--">－</text>
              <text class="n">{{ headcount }}</text>
              <text @click="headcount < 50 && headcount++">＋</text>
            </view>
          </view>
          <input class="input" style="margin-top: 16rpx" v-model="note" placeholder="备注（可选）" />
          <button class="btn" @click="signup">报名参加</button>
        </view>
      </template>
      <view v-if="!a.mySignup?.checkedInAt" class="checkin">
        <view class="muted" style="margin-bottom: 12rpx">到场后输入管理员公布的签到码</view>
        <view class="row">
          <input class="input grow" style="margin: 0" v-model="code" type="number" maxlength="6" placeholder="6 位签到码" />
          <button class="btn" size="mini" @click="checkin">签到</button>
        </view>
      </view>
    </view>

    <view v-if="a.kind === 'activity' && a.signups.length" class="card">
      <view class="card-title">报名名单（{{ a.signups.length }}）</view>
      <view v-for="s in a.signups" :key="s.id" class="list-item">
        <text class="grow">{{ s.displayName || '族人' }}<text v-if="s.linkedPersonName" class="muted">（{{ s.linkedPersonName }}）</text></text>
        <text class="muted">{{ s.headcount }} 人</text>
        <text v-if="s.checkedInAt" class="tag green">已签到</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { ACTIVITY_CATEGORY_LABELS, type ActivityDetail } from '@zupu/shared';
import { fmtTime, m4, run } from '../../api';
import { requestSubscribe } from '../../subscribe';

const id = ref('');
const a = ref<ActivityDetail | null>(null);
const headcount = ref(1);
const note = ref('');
const code = ref('');

async function load() {
  a.value = (await run(m4.activities.get(id.value))) ?? null;
}
onLoad((o: any) => {
  id.value = o.id;
  load();
});
async function signup() {
  await requestSubscribe(['activity']); // 同意后可在活动前一天收到微信提醒
  if (await run(m4.activities.signup(id.value, { headcount: headcount.value, note: note.value || null }), '报名成功')) load();
}
async function cancel() {
  if ((await run(m4.activities.cancelSignup(id.value), '已取消')) !== undefined) load();
}
async function checkin() {
  if (await run(m4.activities.checkin(id.value, code.value), '签到成功')) load();
}
</script>

<style scoped>
.title { font-size: 40rpx; font-weight: 600; margin: 16rpx 0; }
.kv { display: flex; padding: 6rpx 0; line-height: 1.6; }
.k { width: 140rpx; color: #999; flex-shrink: 0; }
.content { margin-top: 16rpx; white-space: pre-wrap; line-height: 1.8; color: #444; }
.stepper { display: flex; align-items: center; border: 1px solid #e0d2b4; border-radius: 8rpx; }
.stepper text { padding: 6rpx 22rpx; color: #8b1e1e; }
.stepper .n { color: #333; border-left: 1px solid #e0d2b4; border-right: 1px solid #e0d2b4; }
.checkin { margin-top: 24rpx; padding-top: 20rpx; border-top: 1px dashed #eadfca; }
.checkin button { margin: 0; }
</style>
