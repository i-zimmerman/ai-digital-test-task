import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import {
  ISSUE_CATEGORIES,
  IssueFiltersSchema,
  type IssueCategory,
  type IssueFilters,
} from '@rs/contracts';
import { ZodValidationPipe } from '../lib/zod.pipe';
import { IssuesService } from './issues.service';

@Controller('api')
export class IssuesController {
  // Injected by explicit token rather than by constructor type. Decorator
  // metadata needs a TypeScript-aware transpiler; naming the provider keeps
  // the app working under any of them.
  constructor(@Inject(IssuesService) private readonly issues: IssuesService) {}

  @Get('issues')
  topIssues(
    @Query(new ZodValidationPipe(IssueFiltersSchema)) filters: IssueFilters,
  ) {
    return this.issues.topIssues(filters);
  }

  @Get('issues/:category/reviews')
  async issueReviews(
    @Param('category') category: string,
    @Query(new ZodValidationPipe(IssueFiltersSchema)) filters: IssueFilters,
  ) {
    if (!(ISSUE_CATEGORIES as readonly string[]).includes(category)) {
      throw new NotFoundException(`Unknown issue category "${category}"`);
    }
    return this.issues.reviewsForIssue(category as IssueCategory, filters);
  }

  @Get('reviews/:id')
  async review(@Param('id') id: string) {
    const detail = await this.issues.reviewDetail(id);
    if (!detail) throw new NotFoundException(`No review "${id}"`);
    return detail;
  }

  @Get('products')
  products() {
    return this.issues.products();
  }
}
