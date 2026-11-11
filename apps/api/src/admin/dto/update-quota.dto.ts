import { IsInt, Max, Min, ValidateIf } from 'class-validator';

export class UpdateQuotaDto {
  // null = back to the default quota. ValidateIf (not IsOptional) so a missing key
  // is rejected instead of silently resetting the user to the default.
  @ValidateIf((o) => o.quotaBytes !== null)
  @IsInt()
  @Min(0)
  @Max(2 ** 50)
  quotaBytes: number | null;
}
