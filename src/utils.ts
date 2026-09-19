import QRCode from 'qrcode';
import type { MoveTask, Box, BoxStatus, UnloadTier, Vehicle } from './types';

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export function generateBoxCode(task: MoveTask, roomTo: string): string {
  const prefix = roomTo.charAt(0).toUpperCase();
  const sameRoomBoxes = task.boxes.filter((b) => b.roomTo === roomTo);
  const seq = sameRoomBoxes.length + 1;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

export async function generateQRDataURL(taskId: string, code: string): Promise<string> {
  const text = `movedoc://${taskId}/${code}`;
  return QRCode.toDataURL(text, { width: 256, margin: 2 });
}

export function compressImage(file: File, maxLongEdge = 1024, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const longEdge = Math.max(width, height);
      if (longEdge > maxLongEdge) {
        const ratio = maxLongEdge / longEdge;
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export function vibrateShort(): void {
  if (navigator.vibrate) navigator.vibrate(50);
}

export function playBeep(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    // ignore
  }
}

export function parseQRContent(text: string): { taskId?: string; code?: string } {
  const match = text.match(/^movedoc:\/\/([^/]+)\/(.+)$/);
  if (!match) return {};
  return { taskId: match[1], code: match[2] };
}

export function statusColor(status: BoxStatus): string {
  switch (status) {
    case 'packed':
      return '#9ca3af';
    case 'loaded':
      return '#3b82f6';
    case 'arrived':
      return '#22c55e';
    case 'unpacked':
      return '#10b981';
    case 'damaged':
      return '#ef4444';
    case 'missing':
      return '#f59e0b';
    default:
      return '#9ca3af';
  }
}

export function statusLabel(status: BoxStatus): string {
  const map: Record<BoxStatus, string> = {
    packed: '待打包',
    loaded: '已装车',
    arrived: '已到达',
    unpacked: '已拆箱',
    damaged: '破损',
    missing: '缺失',
  };
  return map[status];
}

export function estimateVehicle(boxCount: number, avgVolumeM3 = 0.08): { vehicle: string; suggestion: string } {
  const totalVolume = boxCount * avgVolumeM3;
  if (totalVolume <= 8) return { vehicle: '面包车/小型货车', suggestion: '建议选用 4.2m 厢式货车或面包车' };
  if (totalVolume <= 18) return { vehicle: '中型货车', suggestion: '建议选用 6.8m 厢式货车' };
  return { vehicle: '大型货车/多车', suggestion: '箱数较多，建议选用 9.6m 货车或分多车运输' };
}

export function roomProgress(task: MoveTask, room: string): { total: number; unpacked: number; damaged: number } {
  const boxes = task.boxes.filter((b) => b.roomTo === room);
  return {
    total: boxes.length,
    unpacked: boxes.filter((b) => b.status === 'unpacked').length,
    damaged: boxes.filter((b) => b.status === 'damaged').length,
  };
}

export const UNLOAD_TIERS: UnloadTier[] = ['first', 'middle', 'last'];

export function tierOf(box: Box): UnloadTier {
  return box.unloadTier ?? 'middle';
}

export function tierLabel(tier: UnloadTier): string {
  const map: Record<UnloadTier, string> = {
    first: '先卸',
    middle: '中间卸',
    last: '最后卸',
  };
  return map[tier];
}

export function tierColor(tier: UnloadTier): string {
  const map: Record<UnloadTier, string> = {
    first: '#22c55e',
    middle: '#f59e0b',
    last: '#9ca3af',
  };
  return map[tier];
}

// 装车顺序里各档的先后：最后卸的最先装（压车厢最里面），先卸的最后装（最外面）
const TIER_LOAD_RANK: Record<UnloadTier, number> = { last: 0, middle: 1, first: 2 };

// 装车顺序比较：排前面的先装（靠车厢最里面），排后面的后装（靠门口，先卸）
export function compareLoadOrder(a: Box, b: Box): number {
  const t = TIER_LOAD_RANK[tierOf(a)] - TIER_LOAD_RANK[tierOf(b)];
  if (t !== 0) return t;
  const f = (b.floorTo ?? 1) - (a.floorTo ?? 1); // 同档内楼层低的先卸 → 高楼层靠里先装
  if (f !== 0) return f;
  const d = (b.distanceKm ?? 0) - (a.distanceKm ?? 0); // 目的地近的先卸 → 远的靠里先装
  if (d !== 0) return d;
  const w = (b.weightKg ?? 0) - (a.weightKg ?? 0); // 沉的垫底先装
  if (w !== 0) return w;
  return a.code.localeCompare(b.code);
}

// 重排一辆车的装车单：同一辆车同一件只排一次（去重），剔除已删除的箱子，再按规则排序
export function sortVehicleLoad(vehicle: Vehicle, boxes: Box[]): string[] {
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const unique = [...new Set(vehicle.boxIds)].filter((id) => byId.has(id));
  return unique.map((id) => byId.get(id)!).sort(compareLoadOrder).map((b) => b.id);
}

// 整份装车单重排：任何箱子的先后档/楼层/距离/重量变了都调用
export function resortTaskVehicles(task: MoveTask): void {
  if (!task.vehicles) return;
  for (const v of task.vehicles) {
    v.boxIds = sortVehicleLoad(v, task.boxes);
  }
}
