import AutocompleteClient from "./AutocompleteClient";
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Table from '@mui/material/Table';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import TableBodyClient from './TableBodyClient';

export const metadata = {
  title: "Guess Vocaloid!",
};



// 组件列表：总页面，搜索模块（搜索框，搜索按钮），显示模块（显示title，显示内容（一个个显示条目））

export default function GuessSongPage() {

  return (
    <Box component="section" sx={{ p: 2, border: '1px dashed grey' }}>
      <h1>术力口猜歌!</h1>
      <p>输入歌曲名，点击搜索按钮，显示对应的歌曲信息</p>
      <Container maxWidth="xs">
        <AutocompleteClient />
      </Container>
      <Box>
        <SongList />
      </Box>
    </Box>
  )
}

export function SongList() {

  return (
    <TableContainer component={Paper} sx={{ maxWidth: 1200, margin: "auto" }}>
      <Table sx={{ minWidth: 650 }} aria-label="simple table">
        <TableHead
          sx={{
            backgroundColor: 'lightblue',
            '& .MuiTableCell-head': {
              color: 'black',
            },
          }}
        >
          <TableRow>
            <TableCell>歌曲名</TableCell>
            <TableCell align="left">虚拟歌手</TableCell>
            <TableCell align="left">P主</TableCell>
          </TableRow>
        </TableHead>
        <TableBodyClient />
      </Table>
    </TableContainer>
  );
}