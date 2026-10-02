/**
 * 第三方模块类型声明
 */

/** @m-lab/ndt7 官方 JS 客户端（CommonJS，无官方类型） */
declare module '@m-lab/ndt7' {
  export interface Ndt7Config {
    download?: { duration?: number; maxExpectedMBits?: number }
    upload?: { duration?: number; maxExpectedMBits?: number }
    server?: string | null
    protocol?: 'wss' | 'ws'
    metadata?: Record<string, string>
    loadbalancer?: string
    /** M-Lab 数据政策：用户接受结果进入公开研究数据集 */
    userAcceptedDataPolicy?: boolean
    mlabDataPolicyInapplicable?: boolean
    /** worker 脚本地址：本站用 public/ndt7/ 下的静态文件（不经 Vite 打包） */
    downloadworkerfile?: string
    uploadworkerfile?: string
  }

  export interface Ndt7ClientMeasurement {
    ElapsedTime: number
    NumBytes: number
    MeanClientMbps: number
  }

  export interface Ndt7ServerMeasurement {
    /** tcp-info 快照（字段单位均为微秒） */
    TCPInfo?: {
      MinRTT?: number
      RTT?: number
      RTTVar?: number
      BytesSent?: number
      BytesRetrans?: number
      [key: string]: unknown
    }
    BBRInfo?: {
      MinRTT?: number
      BW?: number
      [key: string]: unknown
    }
    AppInfo?: {
      NumBytes?: number
      ElapsedTime?: number
    }
    [key: string]: unknown
  }

  export interface Ndt7Measurement {
    Source: 'client' | 'server'
    Data: Partial<Ndt7ClientMeasurement> & Partial<Ndt7ServerMeasurement>
  }

  export interface Ndt7CompleteResult {
    LastClientMeasurement: Ndt7ClientMeasurement | undefined
    LastServerMeasurement: Ndt7ServerMeasurement | undefined
  }

  export interface Ndt7Callbacks {
    error?: (message: string) => void
    serverDiscovery?: (data: { loadbalancer: string }) => void
    serverChosen?: (server: Record<string, unknown>) => void
    start?: (data: unknown) => void
    downloadStart?: (data: unknown) => void
    downloadMeasurement?: (m: Ndt7Measurement) => void
    downloadComplete?: (r: Ndt7CompleteResult) => void
    uploadStart?: (data: unknown) => void
    uploadMeasurement?: (m: Ndt7Measurement) => void
    uploadComplete?: (r: Ndt7CompleteResult) => void
    complete?: (r: Ndt7CompleteResult) => void
  }

  export function test(config: Ndt7Config, callbacks: Ndt7Callbacks): Promise<number>
}
