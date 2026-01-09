import { Test, TestingModule } from '@nestjs/testing';
import { AzugaService } from './azuga.service';

describe('AzugaService', () => {
  let service: AzugaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AzugaService],
    }).compile();

    service = module.get<AzugaService>(AzugaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
