import { buildOpenApi } from '@fedsa/contract';

export class OpenApiService {
  private readonly document = buildOpenApi();

  get() {
    return this.document;
  }
}
