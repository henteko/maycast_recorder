/**
 * Dependency Injection Container
 *
 * サービスとUse Caseの依存関係を管理
 */
export class DIContainer {
  private static instance: DIContainer;
  private services = new Map<string, unknown>();

  private constructor() {
    // private constructor for singleton
  }

  static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
    }
    return DIContainer.instance;
  }

  /**
   * サービスを登録
   */
  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  /**
   * サービスを解決
   */
  resolve<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service not found: ${name}`);
    }
    return service as T;
  }

  /**
   * サービスの存在確認
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * すべてのサービスをクリア
   */
  clear(): void {
    this.services.clear();
  }

  /**
   * テスト用: モックサービスを登録
   */
  registerMock<T>(name: string, mock: T): void {
    this.register(name, mock);
  }
}
