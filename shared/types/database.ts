export interface BaseEntity {
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  is_del: number; // 0 or 1
}

export interface Site extends BaseEntity {
  id: number;
  site_name: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

export interface Dataset extends BaseEntity {
  id: number;
  site_id: number;
  dataset_name: string;
  source_file_path?: string;
  import_time: string;
  description?: string;
}

export interface ColumnSetting extends BaseEntity {
  id: number;
  dataset_id: number;
  column_name: string;
  column_index?: number;
  data_type?: string;
  min_threshold?: number;
  max_threshold?: number;
  is_active: number; // 0 or 1
}

export interface DatasetVersion extends BaseEntity {
  id: number;
  dataset_id: number;
  parent_version_id?: number;
  stage_type: 'RAW' | 'FILTERED' | 'QC';
  file_path: string;
  remark?: string;
}

export interface StatVersionDetail extends BaseEntity {
  id: number;
  version_id: number;
  total_rows: number;
  total_cols: number;
  total_missing_count: number;
  total_outlier_count: number;
  column_stats_json?: string;
  calculated_at: string;
}

export interface ColumnStats {
  missing_count: number;
  outlier_count: number;
  min_val?: number;
  max_val?: number;
  mean_val?: number;
  std_dev?: number;
}
