'use client';

import React from 'react';
import { TableBody, TableRow, TableCell } from '@mui/material';
import useSelectedItemsStore from './store';
import type { SongType } from './type';

export default function TableBodyClient() {
    const { selectedItems } = useSelectedItemsStore();

    return (
        <TableBody>
            {selectedItems.map((row: SongType) => (
                <TableRow key={row.id}>
                    <TableCell component="th" scope="row">
                        {row.songName}
                    </TableCell>
                    <TableCell align="left">{row.singer}</TableCell>
                    <TableCell align="left">{row.producer}</TableCell>
                </TableRow>
            ))}
        </TableBody>
    );
}
