import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, query, params, user, ip, headers } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: async (response) => {
          const endTime = Date.now();
          const duration = endTime - startTime;

          // Log to console (in production, this would go to a logging service)
          console.log(`[AUDIT] ${method} ${url} - ${duration}ms - SUCCESS`, {
            user_id: user?.id || null,
            ip: ip || headers['x-forwarded-for'] || 'unknown',
            timestamp: new Date().toISOString(),
          });

          // Note: To persist to document_db.json, inject MongoMockService at module level
          // For now, we just log to console as per requirements
        },
        error: async (error) => {
          const endTime = Date.now();
          const duration = endTime - startTime;

          console.error(`[AUDIT] ${method} ${url} - ${duration}ms - ERROR`, {
            user_id: user?.id || null,
            ip: ip || headers['x-forwarded-for'] || 'unknown',
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        },
      }),
    );
  }
}
