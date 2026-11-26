import { Box, Button, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'

import { RequestIdNote } from './RequestIdNote'
import { queryErrorView } from './QueryErrorState.logic'

const CONTAINER_PADDING = { compact: 2, regular: 4 } as const
const CONTAINER_GAP = 1
const TITLE_FONT_SIZE_PX = { compact: 14, regular: 16 } as const
const TITLE_FONT_WEIGHT = 600
const MESSAGE_FONT_SIZE_PX = 13
const MESSAGE_MAX_WIDTH_PX = 420
const RETRY_BUTTON_MARGIN_TOP = 0.5

type QueryErrorStateProps = {
  error: unknown
  onRetry?: () => void
  compact?: boolean
}

export function QueryErrorState({
  error,
  onRetry,
  compact = false,
}: QueryErrorStateProps) {
  const { t } = useTranslation()
  const { message, requestId } = queryErrorView(error)
  const size = compact ? 'compact' : 'regular'

  return (
    <Box
      role="alert"
      sx={{
        p: CONTAINER_PADDING[size],
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: CONTAINER_GAP,
        textAlign: 'center',
      }}
    >
      <Typography
        component="h2"
        sx={{ fontSize: TITLE_FONT_SIZE_PX[size], fontWeight: TITLE_FONT_WEIGHT }}
      >
        {t('errors.loadFailed')}
      </Typography>

      <Typography
        sx={{
          fontSize: MESSAGE_FONT_SIZE_PX,
          color: 'text.secondary',
          maxWidth: MESSAGE_MAX_WIDTH_PX,
        }}
      >
        {message ?? t('errors.generic')}
      </Typography>

      {onRetry && (
        <Button
          size="small"
          variant="outlined"
          onClick={onRetry}
          sx={{ mt: RETRY_BUTTON_MARGIN_TOP }}
        >
          {t('common.retry')}
        </Button>
      )}

      {requestId && (
        <Box sx={{ color: 'text.secondary' }}>
          <RequestIdNote requestId={requestId} />
        </Box>
      )}
    </Box>
  )
}
