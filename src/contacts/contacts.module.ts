import { Module } from '@nestjs/common';
import { ContactPolicyService } from './contact-policy.service';
import { ContactSettingsRepository } from './contact-settings.repository';

@Module({
  providers: [ContactPolicyService, ContactSettingsRepository],
  exports: [ContactPolicyService, ContactSettingsRepository],
})
export class ContactsModule {}
