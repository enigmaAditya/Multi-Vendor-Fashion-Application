-- CreateIndex
CREATE INDEX "otp_requests_phone_idx" ON "otp_requests"("phone");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");
