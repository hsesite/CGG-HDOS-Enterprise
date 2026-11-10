import { lazy } from 'react';

// Keep operational modules in separate chunks so field users download only
// the module they open. Shared lazy exports avoid duplicate module instances
// between desktop windows and the mobile workspace.
export const DashboardModule = lazy(() => import('./DashboardModule').then(module => ({ default: module.DashboardModule })));
export const InspectionModule = lazy(() => import('./InspectionModule').then(module => ({ default: module.InspectionModule })));
export const HazardModule = lazy(() => import('./HazardModule').then(module => ({ default: module.HazardModule })));
export const PICAModule = lazy(() => import('./PICAModule').then(module => ({ default: module.PICAModule })));
export const IncidentModule = lazy(() => import('./IncidentModule').then(module => ({ default: module.IncidentModule })));
export const RepositoryModule = lazy(() => import('./RepositoryModule').then(module => ({ default: module.RepositoryModule })));
export const ContractorModule = lazy(() => import('./ContractorModule').then(module => ({ default: module.ContractorModule })));
export const MapModule = lazy(() => import('./MapModule').then(module => ({ default: module.MapModule })));
export const AIModule = lazy(() => import('./AIModule').then(module => ({ default: module.AIModule })));
export const SyncModule = lazy(() => import('./SyncModule').then(module => ({ default: module.SyncModule })));
export const SettingsModule = lazy(() => import('./SettingsModule').then(module => ({ default: module.SettingsModule })));
export const RoleVerificationPanel = lazy(() => import('./RoleVerificationPanel').then(module => ({ default: module.RoleVerificationPanel })));
