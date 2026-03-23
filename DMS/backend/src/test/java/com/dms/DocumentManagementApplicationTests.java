package com.dms;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import com.dms.user.repository.AppUserRepository;
import com.dms.user.repository.UserGroupRepository;

@SpringBootTest
class DocumentManagementApplicationTests {

	@MockBean
	AppUserRepository userRepository;

	@MockBean
	UserGroupRepository groupRepository;

	@Test
	void contextLoads() {
	}

}
