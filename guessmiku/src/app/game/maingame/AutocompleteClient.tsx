"use client";

import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import { vocaloidSong } from "../../lib/testdata";
import useSelectedItemsStore from './store';
import type { SongType } from './type';

export default function AutocompleteClient() {
    const { addItem } = useSelectedItemsStore();

    const defaultProps = {
        options: vocaloidSong,
        getOptionLabel: (option: SongType) => option.songName,
    };

    return (
        <Autocomplete
            {...defaultProps}
            id="clear-on-escape"
            clearOnEscape
            includeInputInList
            autoComplete
            renderInput={(params) => (
                <TextField {...params} label="输入歌曲名" variant="standard" />
            )}
            onChange={(event, newValue) => {
                if (newValue) {
                    addItem(newValue);
                }
            }}
        />
    );
}