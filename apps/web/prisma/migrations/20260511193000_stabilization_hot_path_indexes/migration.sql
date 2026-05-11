CREATE INDEX "Cycle_resolvedAt_createdAt_idx" ON "Cycle"("resolvedAt", "createdAt");
CREATE INDEX "Cycle_status_registrationEndsAt_idx" ON "Cycle"("status", "registrationEndsAt");
CREATE INDEX "Cycle_status_testingEndsAt_idx" ON "Cycle"("status", "testingEndsAt");
CREATE INDEX "Cycle_status_activeStartedAt_idx" ON "Cycle"("status", "activeStartedAt");
CREATE INDEX "Cycle_updatedAt_idx" ON "Cycle"("updatedAt");

CREATE INDEX "Fortress_cycleId_joinedAt_idx" ON "Fortress"("cycleId", "joinedAt");
CREATE INDEX "Fortress_updatedAt_idx" ON "Fortress"("updatedAt");

CREATE INDEX "AttackUnit_cycleId_resolvedAt_cancelledAt_launchedAt_idx" ON "AttackUnit"("cycleId", "resolvedAt", "cancelledAt", "launchedAt");
CREATE INDEX "AttackUnit_updatedAt_id_idx" ON "AttackUnit"("updatedAt", "id");

CREATE INDEX "Battlefield_cycleId_status_startedAt_idx" ON "Battlefield"("cycleId", "status", "startedAt");

CREATE INDEX "ChatMessage_createdAt_id_idx" ON "ChatMessage"("createdAt", "id");
