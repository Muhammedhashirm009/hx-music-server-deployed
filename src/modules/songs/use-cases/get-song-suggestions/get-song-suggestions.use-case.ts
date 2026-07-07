import { Endpoints } from '#common/constants'
import { ApiContextEnum } from '#common/enums'
import { useFetch } from '#common/helpers'
import { createSongPayload } from '#modules/songs/helpers'
import { CreateSongStationUseCase, GetSongByIdUseCase } from '#modules/songs/use-cases'
import { SearchSongsUseCase } from '#modules/search/use-cases'
import { HTTPException } from 'hono/http-exception'
import type { IUseCase } from '#common/types'
import type { SongModel, SongSuggestionAPIResponseModel } from '#modules/songs/models'
import type { z } from 'zod'

export interface GetSongSuggestionsArgs {
  songId: string
  limit: number
}

export class GetSongSuggestionsUseCase implements IUseCase<GetSongSuggestionsArgs, z.infer<typeof SongModel>[]> {
  private readonly createSongStation: CreateSongStationUseCase

  constructor() {
    this.createSongStation = new CreateSongStationUseCase()
  }

  async execute({ songId, limit }: GetSongSuggestionsArgs) {
    let suggestionsList: z.infer<typeof SongModel>[] = []

    try {
      const stationId = await this.createSongStation.execute(songId)

      const { data, ok } = await useFetch<z.infer<typeof SongSuggestionAPIResponseModel>>({
        endpoint: Endpoints.songs.suggestions,
        params: {
          stationid: stationId,
          k: limit
        },
        context: ApiContextEnum.ANDROID
      })

      if (data && ok) {
        const { stationid, ...suggestions } = data
        suggestionsList = Object.values(suggestions)
          .filter((element: any) => element && typeof element === 'object' && 'song' in element && element.song)
          .map((element: any) => createSongPayload(element.song))
          .slice(0, limit)
      }
    } catch (e) {
      console.warn('Official suggestions call failed, falling back to search recommendations:', e)
    }

    // Fallback: If suggestions is empty (common on Cloudflare Workers/hosting IPs due to WAF blocking),
    // fetch similar songs by searching for the song's primary artist or album!
    if (suggestionsList.length === 0) {
      try {
        const songByIdUseCase = new GetSongByIdUseCase()
        const songs = await songByIdUseCase.execute({ songIds: songId })
        if (songs && songs.length > 0) {
          const originalSong = songs[0]
          const artistName = originalSong.artists?.primary?.[0]?.name || originalSong.album?.name
          
          if (artistName) {
            const searchSongsUseCase = new SearchSongsUseCase()
            const searchResults = await searchSongsUseCase.execute({
              query: artistName,
              page: 1,
              limit: limit + 1
            })
            
            if (searchResults && searchResults.results) {
              suggestionsList = searchResults.results
                .filter((s: any) => s.id !== songId)
                .slice(0, limit)
            }
          }
        }
      } catch (err) {
        console.error('Fallback recommendations generation failed:', err)
      }
    }

    if (suggestionsList.length === 0) {
      throw new HTTPException(404, { message: `no suggestions found for the given song` })
    }

    return suggestionsList
  }
}
