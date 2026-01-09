import { Module } from '@nestjs/common';
import { AzugaService } from './azuga.service';

@Module({
  providers: [AzugaService]
})
export class AzugaModule {}
