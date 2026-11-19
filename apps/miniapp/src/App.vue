<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
onLaunch(() => {});
</script>

<style>
page {
  background: #faf6ee;
  color: #2c2c2c;
  font-size: 28rpx;
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.serif { font-family: 'Songti SC', 'STSong', 'SimSun', serif; }
.muted { color: #999; font-size: 24rpx; }
.card { background: #fff; border-radius: 16rpx; margin: 20rpx 24rpx; padding: 24rpx; box-shadow: 0 2rpx 8rpx rgba(139, 30, 30, 0.06); }
.card-title { font-size: 30rpx; font-weight: 600; color: #6e1414; margin-bottom: 16rpx; }
.row { display: flex; align-items: center; gap: 16rpx; }
.grow { flex: 1; min-width: 0; }
.male { color: #2f6fd6; }
.female { color: #d14d72; }
.tag { display: inline-block; font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 6rpx; background: #f3e3c3; color: #8a6d3b; }
.tag.red { background: #fbe3e3; color: #8b1e1e; }
.tag.green { background: #e3f4e6; color: #2e7d32; }
.tag.gray { background: #eee; color: #888; }
.btn { background: #8b1e1e; color: #fff; border-radius: 12rpx; font-size: 30rpx; }
.btn-plain { background: #fff; color: #8b1e1e; border: 1px solid #8b1e1e; border-radius: 12rpx; font-size: 30rpx; }
.input { background: #f7f2e8; border-radius: 12rpx; padding: 18rpx 20rpx; font-size: 28rpx; margin-bottom: 20rpx; }
.list-item { display: flex; align-items: center; gap: 16rpx; padding: 22rpx 0; border-bottom: 1px dashed #eadfca; }
.list-item:last-child { border-bottom: 0; }
.empty { text-align: center; color: #aaa; padding: 60rpx 0; }
</style>
