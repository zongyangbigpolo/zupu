import { Module } from '@nestjs/common';
import { PersonsController } from './persons.controller';
import { PersonsService } from './persons.service';
import { TreeService } from './tree.service';

@Module({ controllers: [PersonsController], providers: [PersonsService, TreeService], exports: [PersonsService] })
export class PersonsModule {}
