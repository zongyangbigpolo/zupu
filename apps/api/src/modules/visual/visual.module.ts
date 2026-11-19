import { Controller, Get, Module } from '@nestjs/common';
import type { MapConfig } from '@zupu/shared';
import { MigrationsController, MigrationsService } from './migrations';
import { PedigreeController, PedigreeService } from './pedigree';
import { SitesController, SitesService } from './sites';
import { TimelineController, TimelineService } from './timeline';
import { VisualHelper } from './visual.helper';

/**
 * 地图配置（公开）：国内合规地图服务。
 * MAP_PROVIDER=amap|tencent|offline；AMAP_KEY + AMAP_SECURITY_CODE（高德 JS API 2.0）；TMAP_KEY（腾讯地图 GL）。
 * 未配置 key 时返回 offline，前端使用内置离线 ECharts 中国地图。
 */
export function mapConfig(env: NodeJS.ProcessEnv = process.env): MapConfig {
  const amap = env.AMAP_KEY || null;
  const tmap = env.TMAP_KEY || null;
  const want = env.MAP_PROVIDER;
  if ((want === 'amap' || !want) && amap) return { provider: 'amap', key: amap, securityJsCode: env.AMAP_SECURITY_CODE || null };
  if ((want === 'tencent' || !want) && tmap) return { provider: 'tencent', key: tmap, securityJsCode: null };
  return { provider: 'offline', key: null, securityJsCode: null };
}

@Controller('maps')
export class MapConfigController {
  @Get('config')
  config() {
    return mapConfig();
  }
}

/** M3 可视化：迁徙地图、祠堂/祖坟/祖屋、家族时间轴（含大事记）、传统吊线谱与 PDF 谱书 */
@Module({
  controllers: [MapConfigController, MigrationsController, SitesController, TimelineController, PedigreeController],
  providers: [VisualHelper, MigrationsService, SitesService, TimelineService, PedigreeService],
})
export class VisualModule {}
