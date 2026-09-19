import type { MoveTask, Box, Vehicle, UnloadTier } from './types';
import { uid, resortTaskVehicles } from './utils';

const DB_NAME = 'MovingBoxTracker';
const DB_VERSION = 1;
const STORE_TASKS = 'tasks';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_TASKS)) {
        db.createObjectStore(STORE_TASKS, { keyPath: 'id' });
      }
    };
  });
}

export async function getAllTasks(): Promise<MoveTask[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TASKS, 'readonly');
    const store = tx.objectStore(STORE_TASKS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as MoveTask[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getTask(id: string): Promise<MoveTask | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TASKS, 'readonly');
    const store = tx.objectStore(STORE_TASKS);
    const req = store.get(id);
    req.onsuccess = () => resolve((req.result as MoveTask) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTask(task: MoveTask): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TASKS, 'readwrite');
    const store = tx.objectStore(STORE_TASKS);
    const req = store.put(task);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTask(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TASKS, 'readwrite');
    const store = tx.objectStore(STORE_TASKS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function addBox(taskId: string, box: Box): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  task.boxes.push(box);
  await saveTask(task);
}

export async function updateBox(taskId: string, box: Box): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  const idx = task.boxes.findIndex((b) => b.id === box.id);
  if (idx === -1) throw new Error('Box not found');
  task.boxes[idx] = box;
  resortTaskVehicles(task); // 楼层/重量等变化会影响装车顺序
  await saveTask(task);
}

export async function deleteBox(taskId: string, boxId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  task.boxes = task.boxes.filter((b) => b.id !== boxId);
  if (task.vehicles) {
    for (const v of task.vehicles) v.boxIds = v.boxIds.filter((id) => id !== boxId);
  }
  await saveTask(task);
}

function ensureVehicles(task: MoveTask): Vehicle[] {
  if (!task.vehicles) task.vehicles = [];
  return task.vehicles;
}

export async function addVehicle(taskId: string, name: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  ensureVehicles(task).push({ id: uid(), name, boxIds: [], createdAt: Date.now() });
  await saveTask(task);
}

export async function deleteVehicle(taskId: string, vehicleId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  task.vehicles = ensureVehicles(task).filter((v) => v.id !== vehicleId);
  await saveTask(task);
}

// 把箱子装上某辆车：一件货只能在一辆车上，同一辆车不会重复排同一件
export async function assignBoxToVehicle(taskId: string, vehicleId: string, boxId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  const vehicles = ensureVehicles(task);
  const target = vehicles.find((v) => v.id === vehicleId);
  if (!target) throw new Error('Vehicle not found');
  if (!task.boxes.some((b) => b.id === boxId)) throw new Error('Box not found');
  for (const v of vehicles) v.boxIds = v.boxIds.filter((id) => id !== boxId);
  target.boxIds.push(boxId);
  resortTaskVehicles(task);
  await saveTask(task);
}

export async function removeBoxFromVehicle(taskId: string, vehicleId: string, boxId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  const vehicle = ensureVehicles(task).find((v) => v.id === vehicleId);
  if (!vehicle) throw new Error('Vehicle not found');
  vehicle.boxIds = vehicle.boxIds.filter((id) => id !== boxId);
  await saveTask(task);
}

// 改卸货先后档：整份装车单跟着重排
export async function setBoxUnloadTier(taskId: string, boxId: string, tier: UnloadTier): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  const box = task.boxes.find((b) => b.id === boxId);
  if (!box) throw new Error('Box not found');
  box.unloadTier = tier;
  box.updatedAt = Date.now();
  resortTaskVehicles(task);
  await saveTask(task);
}

// 临时挪位置后，按当前各箱子的档位/楼层/距离/重量整单重排
export async function resortVehicles(taskId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');
  resortTaskVehicles(task);
  await saveTask(task);
}
